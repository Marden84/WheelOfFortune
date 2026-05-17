'use strict';

// ── State machine ─────────────────────────────────────────────────────────────
const states = ['Connecting', 'Ready', 'Spinning', 'Result', 'Retry', 'Error'];
let currentState = 'Connecting';

function setState(name) {
  states.forEach((s) => {
    const el = document.getElementById('state' + s);
    if (el) el.classList.toggle('hidden', s !== name);
  });
  currentState = name;
}

// ── Token from URL ────────────────────────────────────────────────────────────
function getToken() {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1] || null;
}

const token = getToken();
let sessionToken = token;
let segmentsData = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const spinBtn = document.getElementById('spinBtn');
const retryBtn = document.getElementById('retryBtn');
const mobileResultIcon = document.getElementById('mobileResultIcon');
const mobileResultMessage = document.getElementById('mobileResultMessage');
const errorText = document.getElementById('errorText');
const mobileConfettiCanvas = document.getElementById('mobileConfettiCanvas');

function resizeMobileConfetti() {
  const el = document.getElementById('stateResult');
  if (!el) return;
  mobileConfettiCanvas.width = el.clientWidth;
  mobileConfettiCanvas.height = el.clientHeight;
}
window.addEventListener('resize', resizeMobileConfetti);
resizeMobileConfetti();

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io();

socket.on('connect', () => {
  if (!sessionToken) {
    showError('Ungültiger QR-Code. Bitte neu scannen.');
    return;
  }
  socket.emit('mobile:join', { token: sessionToken });
});

socket.on('mobile:ready', ({ segments }) => {
  segmentsData = segments;
  setState('Ready');
});

socket.on('mobile:spin-start', () => {
  setState('Spinning');
});

socket.on('mobile:result', ({ segment, isWin, message }) => {
  setState('Result');
  resizeMobileConfetti();
  mobileResultIcon.src = segment.iconPath;
  mobileResultIcon.alt = segment.label.replace('\n', ' ');
  mobileResultMessage.textContent = isWin ? message : 'Leider nichts gewonnen 😔';
  if (isWin) {
    confetti.launch(mobileConfettiCanvas);
  }
});

socket.on('mobile:retry', ({ token: newToken }) => {
  sessionToken = newToken;
  setState('Retry');
});

socket.on('mobile:error', ({ message }) => {
  showError(message);
});

socket.on('disconnect', () => {
  if (currentState !== 'Result' && currentState !== 'Error') {
    showError('Verbindung unterbrochen. Bitte neu scannen.');
  }
});

// ── Button handlers ───────────────────────────────────────────────────────────
spinBtn.addEventListener('click', () => {
  if (currentState !== 'Ready') return;
  spinBtn.disabled = true;
  socket.emit('mobile:spin', { token: sessionToken });
});

retryBtn.addEventListener('click', () => {
  if (currentState !== 'Retry') return;
  // Session is already active (waiting-spin), skip join and spin directly
  setState('Spinning');
  socket.emit('mobile:spin', { token: sessionToken });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function showError(message) {
  errorText.textContent = message || 'Ein Fehler ist aufgetreten.';
  setState('Error');
}
