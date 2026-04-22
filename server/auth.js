const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SESSION_COOKIE = 'cg_session';
const CSRF_COOKIE = 'cg_csrf';
const CSRF_HEADER = 'x-csrf-token';

function newToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function createSession(userId) {
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function getUserByToken(token) {
  if (!token) return null;
  return db
    .prepare(
      `SELECT u.id, u.username, u.email, u.coins, u.verified, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token);
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  req.user = user;
  next();
}

function requireVerified(req, res, next) {
  if (!req.user || !req.user.verified)
    return res.status(403).json({ error: 'Email verification required' });
  next();
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

// Double-submit CSRF: ensure every client has a token in a readable cookie,
// and require a matching X-CSRF-Token header on unsafe methods.
function csrfMiddleware(req, res, next) {
  let token = req.cookies && req.cookies[CSRF_COOKIE];
  if (!token) {
    token = newToken(24);
    res.cookie(CSRF_COOKIE, token, { sameSite: 'lax' }); // readable by JS
  }
  req.csrfToken = token;

  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  if (!safe) {
    const header = req.get(CSRF_HEADER);
    if (!header || header !== token)
      return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  createSession,
  destroySession,
  getUserByToken,
  requireAuth,
  requireVerified,
  hashPassword,
  verifyPassword,
  csrfMiddleware,
  newToken,
};
