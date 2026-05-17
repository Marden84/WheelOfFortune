'use strict';

const crypto = require('crypto');

const sessions = new Map();
const TTL_MS = (parseInt(process.env.SESSION_TTL_MINUTES, 10) || 10) * 60 * 1000;

function createToken() {
  return crypto.randomBytes(8).toString('hex');
}

function createSession(screenSocketId) {
  const token = createToken();
  const session = {
    token,
    screenSocketId,
    mobileSocketId: null,
    state: 'waiting-scan',
    spinsRemaining: 1,
    result: null,
    cleanupTimer: null,
  };
  sessions.set(token, session);
  scheduleCleanup(token);
  return token;
}

function joinSession(token, mobileSocketId) {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.state !== 'waiting-scan') return null;
  session.mobileSocketId = mobileSocketId;
  session.state = 'waiting-spin';
  resetCleanup(token);
  return session;
}

function consumeSpin(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.spinsRemaining <= 0) return null;
  session.spinsRemaining -= 1;
  session.state = 'spinning';
  return session;
}

function completeSession(token, result) {
  const session = sessions.get(token);
  if (!session) return null;
  session.result = result;

  if (result.isRetry) {
    session.spinsRemaining = 1;
    session.state = 'waiting-spin';
  } else {
    session.state = 'complete';
    scheduleCleanup(token);
  }
  return session;
}

function getByToken(token) {
  return sessions.get(token) || null;
}

function getByScreenSocket(socketId) {
  for (const session of sessions.values()) {
    if (session.screenSocketId === socketId) return session;
  }
  return null;
}

function getByMobileSocket(socketId) {
  for (const session of sessions.values()) {
    if (session.mobileSocketId === socketId) return session;
  }
  return null;
}

function removeSession(token) {
  const session = sessions.get(token);
  if (session && session.cleanupTimer) clearTimeout(session.cleanupTimer);
  sessions.delete(token);
}

function scheduleCleanup(token) {
  const session = sessions.get(token);
  if (!session) return;
  if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
  session.cleanupTimer = setTimeout(() => sessions.delete(token), TTL_MS);
}

function resetCleanup(token) {
  scheduleCleanup(token);
}

module.exports = {
  createSession,
  joinSession,
  consumeSpin,
  completeSession,
  getByToken,
  getByScreenSocket,
  getByMobileSocket,
  removeSession,
};
