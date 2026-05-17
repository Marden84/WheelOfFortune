'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const sessionManager = require('./sessionManager');
const { getResult, validateSegments } = require('./wheelLogic');

// --- Load & validate config ---
const configPath = path.join(__dirname, '..', 'config', 'segments.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
validateSegments(config.segments);
console.log(`✓ segments.json loaded — ${config.segments.length} segments, probabilities valid`);

const PORT = parseInt(process.env.PORT, 10) || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

// --- Express + static files ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve segments config to frontend
app.get('/api/segments', (_req, res) => res.json(config));

// Serve mobile page for QR-code scanned URL
app.get('/play/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'mobile', 'index.html'));
});

// Serve screen page at root for convenience redirect
app.get('/', (req, res) => {
  res.redirect('/screen/');
});

// --- QR Code helper ---
async function generateQR(token) {
  const url = `${BASE_URL}/play/${token}`;
  const dataUrl = await QRCode.toDataURL(url, {
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  return { dataUrl, url };
}

// --- Socket.io ---
io.on('connection', (socket) => {

  // ── SCREEN CONNECTS ──────────────────────────────────────────────
  socket.on('screen:ready', async () => {
    const token = sessionManager.createSession(socket.id);
    try {
      const { dataUrl, url } = await generateQR(token);
      socket.emit('screen:qr-ready', { qrDataUrl: dataUrl, qrUrl: url, token });
      console.log(`[screen] ready, token=${token}`);
    } catch (err) {
      console.error('QR generation failed:', err);
    }
  });

  // ── MOBILE JOINS (scanned QR) ─────────────────────────────────────
  socket.on('mobile:join', (data) => {
    const { token } = data || {};
    if (!token) return socket.emit('mobile:error', { message: 'Kein Token übermittelt.' });

    const session = sessionManager.joinSession(token, socket.id);
    if (!session) {
      return socket.emit('mobile:error', { message: 'Session nicht gefunden oder bereits abgelaufen.' });
    }

    // Tell screen that a player has joined
    io.to(session.screenSocketId).emit('screen:player-joined', { token });

    // Send segments config to mobile so it can render result cards
    socket.emit('mobile:ready', {
      segments: config.segments,
      branding: config.branding,
    });

    console.log(`[mobile] joined token=${token}`);
  });

  // ── MOBILE TRIGGERS SPIN ──────────────────────────────────────────
  socket.on('mobile:spin', (data) => {
    const { token } = data || {};
    const session = sessionManager.getByToken(token);

    if (!session || session.mobileSocketId !== socket.id) return;
    if (session.spinsRemaining <= 0) return;

    const consumed = sessionManager.consumeSpin(token);
    if (!consumed) return;

    const winningSegment = getResult(config.segments);
    const winningIndex = config.segments.findIndex((s) => s.id === winningSegment.id);
    // Duration only — the screen computes its own target angle using its current rotation state
    const duration = 3000 + Math.random() * 1500;

    // Store result so screen:spin-complete can retrieve it
    session._pendingResult = { winningSegment };

    // Tell screen to start spinning (screen computes exact angle from its currentAngle)
    io.to(session.screenSocketId).emit('screen:spin-start', {
      segmentIndex: winningIndex,
      segmentCount: config.segments.length,
      duration,
      segmentId: winningSegment.id,
      token,
    });

    // Tell mobile to disable button
    socket.emit('mobile:spin-start', { segmentId: winningSegment.id });

    console.log(`[spin] token=${token} → segment=${winningSegment.id}`);
  });

  // ── SCREEN REPORTS ANIMATION COMPLETE ────────────────────────────
  socket.on('screen:spin-complete', (data) => {
    const { token } = data || {};
    const session = sessionManager.getByToken(token);
    if (!session || !session._pendingResult) return;

    const { winningSegment } = session._pendingResult;
    delete session._pendingResult;

    const updatedSession = sessionManager.completeSession(token, winningSegment);

    // Show result on screen
    socket.emit('screen:show-result', { segment: winningSegment });

    // Send result to mobile
    if (updatedSession && updatedSession.mobileSocketId) {
      if (winningSegment.isRetry) {
        // Same session, same token — mobile can spin again directly
        io.to(updatedSession.mobileSocketId).emit('mobile:retry', { token });
        // Screen: show player is still active
        socket.emit('screen:player-joined', { token });
        console.log(`[result] token=${token} → RETRY granted`);
      } else {
        io.to(updatedSession.mobileSocketId).emit('mobile:result', {
          segment: winningSegment,
          isWin: winningSegment.isWin,
          message: winningSegment.winMessage,
        });

        // Generate new QR for the next player (after short delay for result display)
        setTimeout(async () => {
          const newToken = sessionManager.createSession(socket.id);
          try {
            const { dataUrl, url } = await generateQR(newToken);
            socket.emit('screen:new-qr', { qrDataUrl: dataUrl, qrUrl: url, token: newToken });
            console.log(`[screen] new QR generated, token=${newToken}`);
          } catch (err) {
            console.error('New QR generation failed:', err);
          }
        }, 5000);
      }
    }
  });

  // ── DISCONNECT HANDLING ───────────────────────────────────────────
  socket.on('disconnect', () => {
    // Check if a screen disconnected — invalidate session
    const screenSession = sessionManager.getByScreenSocket(socket.id);
    if (screenSession) {
      if (screenSession.mobileSocketId) {
        io.to(screenSession.mobileSocketId).emit('mobile:error', {
          message: 'Verbindung zum Screen unterbrochen.',
        });
      }
      sessionManager.removeSession(screenSession.token);
      console.log(`[screen] disconnected, session removed token=${screenSession.token}`);
    }

    // Check if a mobile disconnected — clean up but keep screen running
    const mobileSession = sessionManager.getByMobileSocket(socket.id);
    if (mobileSession && mobileSession.state !== 'spinning') {
      mobileSession.mobileSocketId = null;
      mobileSession.state = 'waiting-scan';
      console.log(`[mobile] disconnected, session reset token=${mobileSession.token}`);
    }
  });
});

// --- Start ---
server.listen(PORT, () => {
  console.log(`\n🎡 Glücksrad läuft auf ${BASE_URL}`);
  console.log(`   Screen: ${BASE_URL}/screen/`);
  console.log(`   QR-URLs zeigen auf: ${BASE_URL}/play/<token>\n`);
});
