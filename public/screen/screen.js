'use strict';

// ── Config (populated by server via socket) ──────────────────────────────────
let segments = [];
let currentToken = null;
let currentAngle = 0;
let isSpinning = false;

// ── Canvas setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const confettiCanvas = document.getElementById('confettiCanvas');

function resizeCanvas() {
  const size = Math.min(window.innerWidth * 0.72, window.innerHeight * 0.78, 780);
  canvas.width = size;
  canvas.height = size;
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  if (segments.length) drawWheel(currentAngle);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Icon cache ───────────────────────────────────────────────────────────────
const iconCache = {};

function preloadIcons(segs) {
  return Promise.all(
    segs.map(
      (seg) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => { iconCache[seg.id] = img; resolve(); };
          img.onerror = () => resolve(); // continue without icon
          img.src = seg.iconPath;
        })
    )
  );
}

// ── Wheel drawing ─────────────────────────────────────────────────────────────
function drawWheel(angle) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = cx - 6;
  const n = segments.length;
  const segAngle = (2 * Math.PI) / n;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Outer shadow ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, 2 * Math.PI);
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();

  segments.forEach((seg, i) => {
    const startAngle = angle + i * segAngle;
    const endAngle = startAngle + segAngle;
    const midAngle = startAngle + segAngle / 2;

    // Segment fill
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();

    // Separator lines
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * Math.cos(startAngle), cy + radius * Math.sin(startAngle));
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Icon
    const iconR = radius * 0.60;
    const iconX = cx + iconR * Math.cos(midAngle);
    const iconY = cy + iconR * Math.sin(midAngle);
    const iconSize = radius * 0.22;

    if (iconCache[seg.id]) {
      ctx.save();
      ctx.translate(iconX, iconY);
      ctx.rotate(midAngle + Math.PI / 2);
      ctx.drawImage(iconCache[seg.id], -iconSize / 2, -iconSize / 2, iconSize, iconSize);
      ctx.restore();
    }

    // Label
    const labelR = radius * 0.82;
    const labelX = cx + labelR * Math.cos(midAngle);
    const labelY = cy + labelR * Math.sin(midAngle);
    const fontSize = Math.max(11, Math.round(radius * 0.065));

    ctx.save();
    ctx.translate(labelX, labelY);
    ctx.rotate(midAngle + Math.PI / 2);
    ctx.fillStyle = seg.textColor;
    ctx.font = `bold ${fontSize}px 'Helvetica Neue', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = seg.label.split('\n');
    const lineH = fontSize * 1.25;
    const offsetY = -((lines.length - 1) * lineH) / 2;
    lines.forEach((line, li) => {
      ctx.fillText(line, 0, offsetY + li * lineH);
    });
    ctx.restore();
  });

  // Centre circle with Conforama logo
  drawCentre(cx, cy, radius * 0.18);
}

function drawCentre(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(cx, cy, r - 3, 0, 2 * Math.PI);
  ctx.strokeStyle = '#E2001A';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw "C" logo text if no logo image loaded
  if (iconCache['__logo__']) {
    const s = r * 1.4;
    ctx.drawImage(iconCache['__logo__'], cx - s / 2, cy - s / 2, s, s);
  } else {
    ctx.fillStyle = '#E2001A';
    ctx.font = `bold ${Math.round(r * 1.1)}px 'Helvetica Neue', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', cx, cy);
  }
}

// ── Easing ───────────────────────────────────────────────────────────────────
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// ── Spin animation ────────────────────────────────────────────────────────────
function spinAnimation(targetAngle, duration, onComplete) {
  const startAngle = currentAngle;
  const startTime = performance.now();

  function frame(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    currentAngle = startAngle + (targetAngle - startAngle) * easeOutCubic(t);
    drawWheel(currentAngle);

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      currentAngle = targetAngle % (2 * Math.PI);
      isSpinning = false;
      if (onComplete) onComplete();
    }
  }

  isSpinning = true;
  requestAnimationFrame(frame);
}

// ── Result overlay ────────────────────────────────────────────────────────────
const resultOverlay = document.getElementById('resultOverlay');
const resultMessage = document.getElementById('resultMessage');
const resultIcon = document.getElementById('resultIcon');

function showResult(segment) {
  resultIcon.src = segment.iconPath;
  resultIcon.alt = segment.label.replace('\n', ' ');
  resultMessage.textContent = segment.isWin
    ? segment.winMessage
    : segment.id === 'nochmal'
      ? 'Nochmal drehen!'
      : 'Leider nichts gewonnen';
  resultOverlay.classList.add('visible');
  setTimeout(() => resultOverlay.classList.remove('visible'), 5000);
}

// ── QR Panel ──────────────────────────────────────────────────────────────────
const qrImage = document.getElementById('qrImage');
const qrPanel = document.getElementById('qrPanel');
const playerRing = document.getElementById('playerRing');

function updateQR(dataUrl) {
  qrImage.src = dataUrl;
  qrPanel.style.display = 'block';
  playerRing.classList.remove('active');
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
const socket = io();

socket.on('connect', () => {
  socket.emit('screen:ready');
});

socket.on('screen:qr-ready', ({ qrDataUrl, token }) => {
  currentToken = token;
  updateQR(qrDataUrl);
});

socket.on('screen:player-joined', () => {
  playerRing.classList.add('active');
  qrPanel.style.display = 'block';
});

socket.on('screen:spin-start', ({ segmentIndex, segmentCount, duration, token }) => {
  if (isSpinning) return;
  resultOverlay.classList.remove('visible');
  playerRing.classList.remove('active');
  qrPanel.style.display = 'none';

  // Compute angle client-side so currentAngle is always accounted for correctly
  const segAngle = (2 * Math.PI) / segmentCount;
  const jitter = (Math.random() - 0.5) * segAngle * 0.4;
  const segCentre = segmentIndex * segAngle + segAngle / 2 + jitter;
  const pointerAngle = -Math.PI / 2;
  let offset = pointerAngle - segCentre - currentAngle;
  offset = ((offset % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const absoluteTarget = currentAngle + 5 * 2 * Math.PI + offset;

  spinAnimation(absoluteTarget, duration, () => {
    socket.emit('screen:spin-complete', { token });
  });
});

socket.on('screen:show-result', ({ segment }) => {
  showResult(segment);
  if (segment.isWin) {
    confetti.launch(confettiCanvas);
  }
});

socket.on('screen:new-qr', ({ qrDataUrl, token }) => {
  currentToken = token;
  setTimeout(() => updateQR(qrDataUrl), 500);
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Fetch segments from the config endpoint (we piggyback on the socket ready event,
  // but we also pre-fetch so icons load immediately)
  try {
    const resp = await fetch('/api/segments');
    const data = await resp.json();
    segments = data.segments;

    // Preload logo
    const logoImg = new Image();
    logoImg.onload = () => { iconCache['__logo__'] = logoImg; drawWheel(currentAngle); };
    logoImg.src = '/assets/logo.svg';

    await preloadIcons(segments);
    drawWheel(currentAngle);
  } catch (e) {
    console.error('Failed to load segments:', e);
  }
}

init();
