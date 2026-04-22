const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const db = require('./db');
const {
  SESSION_COOKIE,
  createSession,
  destroySession,
  requireAuth,
  requireVerified,
  hashPassword,
  verifyPassword,
  csrfMiddleware,
  newToken,
} = require('./auth');
const { rateLimit, clientIp } = require('./rateLimit');

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(csrfMiddleware);

const PORT = process.env.PORT || 3000;
const STARTING_COINS = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function send(res, status, body) {
  return res.status(status).json(body);
}

const ipKey = (req) => clientIp(req);
const userKey = (req) => (req.user ? `u${req.user.id}` : clientIp(req));

const registerLimiter = rateLimit({ name: 'register', windowMs: 60 * 60 * 1000, max: 5, keyFn: ipKey });
const loginLimiter = rateLimit({ name: 'login', windowMs: 15 * 60 * 1000, max: 10, keyFn: ipKey });
const writeLimiter = rateLimit({ name: 'write', windowMs: 60 * 60 * 1000, max: 60, keyFn: userKey });
const dailyLimiter = rateLimit({ name: 'daily', windowMs: 60 * 60 * 1000, max: 5, keyFn: userKey });
const generalLimiter = rateLimit({ name: 'general', windowMs: 60 * 1000, max: 300, keyFn: ipKey });

app.use('/api', generalLimiter);

function recordTransaction(userId, delta, reason, tradeId = null) {
  const row = db.prepare('SELECT coins FROM users WHERE id = ?').get(userId);
  const balanceAfter = row.coins + delta;
  db.prepare('UPDATE users SET coins = ? WHERE id = ?').run(balanceAfter, userId);
  db.prepare(
    `INSERT INTO transactions (user_id, delta, balance_after, reason, trade_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, delta, balanceAfter, reason, tradeId);
  return balanceAfter;
}

// --- Auth ---

app.get('/api/csrf', (req, res) => {
  // Safe endpoint clients can hit to ensure a CSRF cookie is set.
  send(res, 200, { token: req.csrfToken });
});

app.post('/api/register', registerLimiter, (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password)
    return send(res, 400, { error: 'username, email and password are required' });
  if (username.length < 3 || username.length > 32)
    return send(res, 400, { error: 'username must be 3-32 chars' });
  if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'invalid email' });
  if (password.length < 6) return send(res, 400, { error: 'password must be at least 6 chars' });

  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username))
    return send(res, 409, { error: 'username taken' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
    return send(res, 409, { error: 'email already registered' });

  const token = newToken(16);
  const info = db
    .prepare(
      `INSERT INTO users (username, email, password, coins, verify_token)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(username, email, hashPassword(password), STARTING_COINS, token);

  db.prepare(
    `INSERT INTO transactions (user_id, delta, balance_after, reason)
     VALUES (?, ?, ?, 'signup_bonus')`
  ).run(info.lastInsertRowid, STARTING_COINS, STARTING_COINS);

  const sessToken = createSession(info.lastInsertRowid);
  res.cookie(SESSION_COOKIE, sessToken, { httpOnly: true, sameSite: 'lax' });

  // No SMTP in this demo — log + return the verify link so devs can click it.
  const verifyUrl = `/api/verify?token=${token}`;
  console.log(`[verify] ${email} -> ${verifyUrl}`);
  send(res, 201, {
    id: info.lastInsertRowid,
    username,
    email,
    coins: STARTING_COINS,
    verified: 0,
    verify_url: verifyUrl,
  });
});

app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return send(res, 400, { error: 'username and password required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password))
    return send(res, 401, { error: 'invalid credentials' });

  const token = createSession(user.id);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  send(res, 200, {
    id: user.id,
    username: user.username,
    email: user.email,
    coins: user.coins,
    verified: user.verified,
  });
});

app.post('/api/logout', (req, res) => {
  destroySession(req.cookies && req.cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  send(res, 200, { ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  send(res, 200, req.user);
});

app.get('/api/verify', (req, res) => {
  const token = String(req.query.token || '');
  if (!token) return send(res, 400, { error: 'token required' });
  const user = db.prepare('SELECT id FROM users WHERE verify_token = ?').get(token);
  if (!user) return send(res, 404, { error: 'invalid or used token' });
  db.prepare('UPDATE users SET verified = 1, verify_token = NULL WHERE id = ?').run(user.id);
  // Redirect to the app so the user sees the success message.
  res.redirect('/?verified=1');
});

app.post('/api/resend-verification', requireAuth, writeLimiter, (req, res) => {
  if (req.user.verified) return send(res, 400, { error: 'already verified' });
  const token = newToken(16);
  db.prepare('UPDATE users SET verify_token = ? WHERE id = ?').run(token, req.user.id);
  const verifyUrl = `/api/verify?token=${token}`;
  console.log(`[verify resend] ${req.user.email} -> ${verifyUrl}`);
  send(res, 200, { verify_url: verifyUrl });
});

// --- Listings ---

app.get('/api/listings', (req, res) => {
  const { mine, kind, q, status } = req.query;
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  const me = token ? db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) : null;

  const where = [];
  const params = [];
  if (mine === '1') {
    if (!me) return send(res, 401, { error: 'Not authenticated' });
    where.push('l.user_id = ?');
    params.push(me.user_id);
  }
  if (kind) {
    where.push('l.kind = ?');
    params.push(kind);
  }
  if (status) {
    where.push('l.status = ?');
    params.push(status);
  } else if (mine !== '1') {
    where.push("l.status = 'active'");
  }
  if (q) {
    where.push('(l.title LIKE ? OR l.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const sql = `
    SELECT l.*, u.username AS owner_username
    FROM listings l JOIN users u ON u.id = l.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY l.created_at DESC
    LIMIT 200
  `;
  const rows = db.prepare(sql).all(...params);
  send(res, 200, rows);
});

function validateListingInput(body) {
  const { kind, title, description, unit, quantity, value_coins } = body || {};
  if (!['time', 'item', 'service'].includes(kind))
    return { error: 'kind must be time, item, or service' };
  if (!title || title.length > 120) return { error: 'title required (<=120 chars)' };
  const v = Number(value_coins);
  if (!Number.isInteger(v) || v < 0) return { error: 'value_coins must be a non-negative integer' };
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) return { error: 'quantity must be >= 1' };
  return {
    ok: {
      kind,
      title: String(title).trim(),
      description: String(description || '').trim().slice(0, 2000),
      unit: (unit && String(unit).slice(0, 20)) || (kind === 'time' ? 'hour' : 'piece'),
      quantity: qty,
      value_coins: v,
    },
  };
}

app.post('/api/listings', requireAuth, requireVerified, writeLimiter, (req, res) => {
  const v = validateListingInput(req.body);
  if (v.error) return send(res, 400, { error: v.error });
  const { kind, title, description, unit, quantity, value_coins } = v.ok;
  const info = db
    .prepare(
      `INSERT INTO listings
       (user_id, kind, title, description, unit, quantity, quantity_available, value_coins)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, kind, title, description, unit, quantity, quantity, value_coins);
  send(res, 201, db.prepare('SELECT * FROM listings WHERE id = ?').get(info.lastInsertRowid));
});

app.patch('/api/listings/:id', requireAuth, requireVerified, writeLimiter, (req, res) => {
  const id = Number(req.params.id);
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!listing) return send(res, 404, { error: 'not found' });
  if (listing.user_id !== req.user.id) return send(res, 403, { error: 'forbidden' });
  if (listing.status !== 'active') return send(res, 400, { error: 'only active listings can be edited' });

  const pending = db
    .prepare("SELECT COUNT(*) AS c FROM trades WHERE (listing_id = ? OR offer_listing_id = ?) AND status = 'pending'")
    .get(id, id).c;
  if (pending > 0)
    return send(res, 400, { error: 'cannot edit a listing with pending trades' });

  const allowed = ['title', 'description', 'unit', 'quantity', 'value_coins'];
  const updates = {};
  for (const k of allowed) if (k in (req.body || {})) updates[k] = req.body[k];

  if ('title' in updates && (!updates.title || String(updates.title).length > 120))
    return send(res, 400, { error: 'title required (<=120 chars)' });
  if ('value_coins' in updates) {
    const v = Number(updates.value_coins);
    if (!Number.isInteger(v) || v < 0) return send(res, 400, { error: 'value_coins invalid' });
    updates.value_coins = v;
  }
  if ('quantity' in updates) {
    const q = Number(updates.quantity);
    if (!Number.isInteger(q) || q < 1) return send(res, 400, { error: 'quantity must be >= 1' });
    updates.quantity = q;
    updates.quantity_available = q;
  }

  const keys = Object.keys(updates);
  if (!keys.length) return send(res, 200, listing);
  const setSql = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE listings SET ${setSql}, updated_at = datetime('now') WHERE id = @id`)
    .run({ ...updates, id });
  send(res, 200, db.prepare('SELECT * FROM listings WHERE id = ?').get(id));
});

app.delete('/api/listings/:id', requireAuth, requireVerified, writeLimiter, (req, res) => {
  const id = Number(req.params.id);
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!listing) return send(res, 404, { error: 'not found' });
  if (listing.user_id !== req.user.id) return send(res, 403, { error: 'forbidden' });
  if (listing.status !== 'active')
    return send(res, 400, { error: 'only active listings can be cancelled' });
  db.prepare("UPDATE listings SET status = 'cancelled' WHERE id = ?").run(id);
  for (const t of db
    .prepare("SELECT id FROM trades WHERE (listing_id = ? OR offer_listing_id = ?) AND status = 'pending'")
    .all(id, id)) {
    db.prepare("UPDATE trades SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?").run(t.id);
  }
  send(res, 200, { ok: true });
});

// --- Trades ---

app.post('/api/trades', requireAuth, requireVerified, writeLimiter, (req, res) => {
  const { listing_id, offer_coins, offer_listing_id, offer_quantity, quantity_requested, message } = req.body || {};
  const listing = db.prepare("SELECT * FROM listings WHERE id = ?").get(Number(listing_id));
  if (!listing) return send(res, 404, { error: 'listing not found' });
  if (listing.status !== 'active') return send(res, 400, { error: 'listing not available' });
  if (listing.user_id === req.user.id) return send(res, 400, { error: 'cannot trade with yourself' });

  const qReq = Number(quantity_requested || 1);
  if (!Number.isInteger(qReq) || qReq < 1)
    return send(res, 400, { error: 'quantity_requested must be a positive integer' });
  if (qReq > listing.quantity_available)
    return send(res, 400, { error: `only ${listing.quantity_available} available` });

  const coins = Number(offer_coins || 0);
  if (!Number.isInteger(coins) || coins < 0)
    return send(res, 400, { error: 'offer_coins must be a non-negative integer' });
  if (coins > req.user.coins)
    return send(res, 400, { error: 'insufficient coins' });

  let offeredId = null;
  let offerQty = 0;
  if (offer_listing_id != null && offer_listing_id !== '') {
    const oid = Number(offer_listing_id);
    const offered = db.prepare('SELECT * FROM listings WHERE id = ?').get(oid);
    if (!offered) return send(res, 404, { error: 'offered listing not found' });
    if (offered.user_id !== req.user.id)
      return send(res, 400, { error: 'offered listing must be yours' });
    if (offered.status !== 'active')
      return send(res, 400, { error: 'offered listing is not active' });
    if (offered.id === listing.id)
      return send(res, 400, { error: 'cannot offer the same listing' });
    const oQty = Number(offer_quantity || 1);
    if (!Number.isInteger(oQty) || oQty < 1)
      return send(res, 400, { error: 'offer_quantity must be a positive integer' });
    if (oQty > offered.quantity_available)
      return send(res, 400, { error: `you only have ${offered.quantity_available} of that listing available` });
    offeredId = offered.id;
    offerQty = oQty;
  }

  if (coins <= 0 && !offeredId)
    return send(res, 400, { error: 'must offer at least coins or a listing' });

  const info = db
    .prepare(
      `INSERT INTO trades
       (listing_id, proposer_id, owner_id, quantity_requested,
        offer_coins, offer_listing_id, offer_quantity, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      listing.id,
      req.user.id,
      listing.user_id,
      qReq,
      coins,
      offeredId,
      offerQty,
      (message || '').slice(0, 500)
    );
  send(res, 201, hydrateTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(info.lastInsertRowid)));
});

function hydrateTrade(t) {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(t.listing_id);
  const proposer = db.prepare('SELECT id, username FROM users WHERE id = ?').get(t.proposer_id);
  const owner = db.prepare('SELECT id, username FROM users WHERE id = ?').get(t.owner_id);
  let offerListing = null;
  if (t.offer_listing_id) {
    offerListing = db.prepare('SELECT * FROM listings WHERE id = ?').get(t.offer_listing_id);
  }
  const messageCount = db
    .prepare('SELECT COUNT(*) AS c FROM trade_messages WHERE trade_id = ?')
    .get(t.id).c;
  return { ...t, listing, proposer, owner, offer_listing: offerListing, message_count: messageCount };
}

app.get('/api/trades', requireAuth, (req, res) => {
  const role =
    req.query.role === 'owner' ? 'owner' : req.query.role === 'proposer' ? 'proposer' : 'all';
  let rows;
  if (role === 'owner') {
    rows = db.prepare('SELECT * FROM trades WHERE owner_id = ? ORDER BY created_at DESC').all(req.user.id);
  } else if (role === 'proposer') {
    rows = db.prepare('SELECT * FROM trades WHERE proposer_id = ? ORDER BY created_at DESC').all(req.user.id);
  } else {
    rows = db
      .prepare('SELECT * FROM trades WHERE owner_id = ? OR proposer_id = ? ORDER BY created_at DESC')
      .all(req.user.id, req.user.id);
  }
  send(res, 200, rows.map(hydrateTrade));
});

function decrementListing(listingId, qty) {
  const l = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  const left = l.quantity_available - qty;
  const status = left <= 0 ? 'traded' : 'active';
  db.prepare(
    "UPDATE listings SET quantity_available = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(left, status, listingId);
  return { status, quantity_available: left };
}

app.post('/api/trades/:id/accept', requireAuth, requireVerified, writeLimiter, (req, res) => {
  const id = Number(req.params.id);
  const run = db.transaction(() => {
    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
    if (!trade) throw { status: 404, error: 'trade not found' };
    if (trade.owner_id !== req.user.id) throw { status: 403, error: 'only the listing owner can accept' };
    if (trade.status !== 'pending') throw { status: 400, error: 'trade is not pending' };

    const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(trade.listing_id);
    if (!listing || listing.status !== 'active')
      throw { status: 400, error: 'listing is no longer available' };
    if (listing.quantity_available < trade.quantity_requested)
      throw { status: 400, error: 'listing no longer has enough quantity' };

    if (trade.offer_coins > 0) {
      const proposer = db.prepare('SELECT coins FROM users WHERE id = ?').get(trade.proposer_id);
      if (proposer.coins < trade.offer_coins)
        throw { status: 400, error: 'proposer no longer has enough coins' };
    }

    let offered = null;
    if (trade.offer_listing_id) {
      offered = db.prepare('SELECT * FROM listings WHERE id = ?').get(trade.offer_listing_id);
      if (!offered || offered.status !== 'active')
        throw { status: 400, error: 'offered listing is no longer active' };
      if (offered.quantity_available < trade.offer_quantity)
        throw { status: 400, error: 'offered listing no longer has enough quantity' };
    }

    if (trade.offer_coins > 0) {
      recordTransaction(trade.proposer_id, -trade.offer_coins, 'trade_payment', trade.id);
      recordTransaction(trade.owner_id, trade.offer_coins, 'trade_earning', trade.id);
    }

    decrementListing(listing.id, trade.quantity_requested);
    if (offered) decrementListing(offered.id, trade.offer_quantity);

    db.prepare(
      "UPDATE trades SET status = 'accepted', resolved_at = datetime('now') WHERE id = ?"
    ).run(trade.id);

    // Auto-reject other pending trades on listings that are now sold out or swapped.
    const fresh = db.prepare('SELECT * FROM listings WHERE id = ?').get(listing.id);
    if (fresh.status !== 'active') {
      db.prepare(
        `UPDATE trades SET status = 'rejected', resolved_at = datetime('now')
         WHERE (listing_id = ? OR offer_listing_id = ?) AND status = 'pending' AND id != ?`
      ).run(listing.id, listing.id, trade.id);
    }
    if (offered) {
      const freshOff = db.prepare('SELECT * FROM listings WHERE id = ?').get(offered.id);
      if (freshOff.status !== 'active') {
        db.prepare(
          `UPDATE trades SET status = 'rejected', resolved_at = datetime('now')
           WHERE (listing_id = ? OR offer_listing_id = ?) AND status = 'pending' AND id != ?`
        ).run(offered.id, offered.id, trade.id);
      }
    }
  });

  try {
    run();
  } catch (e) {
    if (e && e.status) return send(res, e.status, { error: e.error });
    throw e;
  }
  send(res, 200, hydrateTrade(db.prepare('SELECT * FROM trades WHERE id = ?').get(id)));
});

app.post('/api/trades/:id/reject', requireAuth, requireVerified, writeLimiter, (req, res) => {
  const id = Number(req.params.id);
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  if (!trade) return send(res, 404, { error: 'trade not found' });
  if (trade.owner_id !== req.user.id)
    return send(res, 403, { error: 'only the listing owner can reject' });
  if (trade.status !== 'pending') return send(res, 400, { error: 'trade is not pending' });
  db.prepare("UPDATE trades SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?").run(id);
  send(res, 200, { ok: true });
});

app.post('/api/trades/:id/cancel', requireAuth, requireVerified, writeLimiter, (req, res) => {
  const id = Number(req.params.id);
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  if (!trade) return send(res, 404, { error: 'trade not found' });
  if (trade.proposer_id !== req.user.id)
    return send(res, 403, { error: 'only the proposer can cancel' });
  if (trade.status !== 'pending') return send(res, 400, { error: 'trade is not pending' });
  db.prepare("UPDATE trades SET status = 'cancelled', resolved_at = datetime('now') WHERE id = ?").run(id);
  send(res, 200, { ok: true });
});

// --- Trade messages ---

function requireTradeParticipant(req, res, next) {
  const id = Number(req.params.id);
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  if (!trade) return send(res, 404, { error: 'trade not found' });
  if (trade.owner_id !== req.user.id && trade.proposer_id !== req.user.id)
    return send(res, 403, { error: 'forbidden' });
  req.trade = trade;
  next();
}

app.get('/api/trades/:id/messages', requireAuth, requireTradeParticipant, (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.id, m.trade_id, m.user_id, m.body, m.created_at, u.username
       FROM trade_messages m JOIN users u ON u.id = m.user_id
       WHERE m.trade_id = ? ORDER BY m.created_at ASC LIMIT 500`
    )
    .all(req.trade.id);
  send(res, 200, rows);
});

app.post('/api/trades/:id/messages', requireAuth, requireVerified, writeLimiter, requireTradeParticipant, (req, res) => {
  const body = String((req.body && req.body.body) || '').trim();
  if (!body) return send(res, 400, { error: 'body required' });
  if (body.length > 2000) return send(res, 400, { error: 'message too long' });
  const info = db
    .prepare('INSERT INTO trade_messages (trade_id, user_id, body) VALUES (?, ?, ?)')
    .run(req.trade.id, req.user.id, body);
  const row = db
    .prepare(
      `SELECT m.id, m.trade_id, m.user_id, m.body, m.created_at, u.username
       FROM trade_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`
    )
    .get(info.lastInsertRowid);
  send(res, 201, row);
});

// --- Wallet ---

app.get('/api/wallet', requireAuth, (req, res) => {
  const balance = db.prepare('SELECT coins FROM users WHERE id = ?').get(req.user.id).coins;
  const transactions = db
    .prepare(
      `SELECT id, delta, balance_after, reason, trade_id, created_at
       FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`
    )
    .all(req.user.id);
  send(res, 200, { balance, transactions });
});

app.post('/api/wallet/daily', requireAuth, requireVerified, dailyLimiter, (req, res) => {
  const last = db
    .prepare(
      `SELECT created_at FROM transactions
       WHERE user_id = ? AND reason = 'daily_claim'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(req.user.id);
  if (last) {
    const hoursSince =
      (Date.now() - new Date(last.created_at.replace(' ', 'T') + 'Z').getTime()) / 36e5;
    if (hoursSince < 24)
      return send(res, 400, {
        error: 'Daily claim already used',
        hours_until_next: Math.ceil(24 - hoursSince),
      });
  }
  const reward = 20;
  const balance = recordTransaction(req.user.id, reward, 'daily_claim');
  send(res, 200, { reward, balance });
});

// --- Static frontend ---

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, _next) => {
  console.error(err);
  send(res, 500, { error: 'internal error' });
});

app.listen(PORT, () => {
  console.log(`coingame listening on http://localhost:${PORT}`);
});
