const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const db = require('./db');
const {
  SESSION_COOKIE,
  createSession,
  destroySession,
  requireAuth,
  hashPassword,
  verifyPassword,
} = require('./auth');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

const PORT = process.env.PORT || 3000;
const STARTING_COINS = 100;

function send(res, status, body) {
  return res.status(status).json(body);
}

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

app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return send(res, 400, { error: 'username and password required' });
  if (username.length < 3 || username.length > 32)
    return send(res, 400, { error: 'username must be 3-32 chars' });
  if (password.length < 6) return send(res, 400, { error: 'password must be at least 6 chars' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return send(res, 409, { error: 'username taken' });

  const info = db
    .prepare('INSERT INTO users (username, password, coins) VALUES (?, ?, ?)')
    .run(username, hashPassword(password), STARTING_COINS);

  db.prepare(
    `INSERT INTO transactions (user_id, delta, balance_after, reason)
     VALUES (?, ?, ?, 'signup_bonus')`
  ).run(info.lastInsertRowid, STARTING_COINS, STARTING_COINS);

  const token = createSession(info.lastInsertRowid);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  send(res, 201, { id: info.lastInsertRowid, username, coins: STARTING_COINS });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return send(res, 400, { error: 'username and password required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password))
    return send(res, 401, { error: 'invalid credentials' });

  const token = createSession(user.id);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  send(res, 200, { id: user.id, username: user.username, coins: user.coins });
});

app.post('/api/logout', (req, res) => {
  destroySession(req.cookies && req.cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  send(res, 200, { ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  send(res, 200, req.user);
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

app.post('/api/listings', requireAuth, (req, res) => {
  const { kind, title, description, unit, quantity, value_coins } = req.body || {};
  if (!['time', 'item', 'service'].includes(kind))
    return send(res, 400, { error: 'kind must be time, item, or service' });
  if (!title || title.length > 120) return send(res, 400, { error: 'title required (<=120 chars)' });
  const v = Number(value_coins);
  if (!Number.isInteger(v) || v < 0) return send(res, 400, { error: 'value_coins must be a non-negative integer' });
  const qty = Number.isInteger(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 1;
  const u = unit && String(unit).slice(0, 20);

  const info = db
    .prepare(
      `INSERT INTO listings (user_id, kind, title, description, unit, quantity, value_coins)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id,
      kind,
      title.trim(),
      (description || '').trim(),
      u || (kind === 'time' ? 'hour' : 'piece'),
      qty,
      v
    );
  const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(info.lastInsertRowid);
  send(res, 201, row);
});

app.delete('/api/listings/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!listing) return send(res, 404, { error: 'not found' });
  if (listing.user_id !== req.user.id) return send(res, 403, { error: 'forbidden' });
  if (listing.status !== 'active')
    return send(res, 400, { error: 'only active listings can be cancelled' });
  db.prepare("UPDATE listings SET status = 'cancelled' WHERE id = ?").run(id);
  // Reject any pending trades for this listing.
  const pending = db
    .prepare("SELECT id FROM trades WHERE listing_id = ? AND status = 'pending'")
    .all(id);
  for (const t of pending) {
    db.prepare(
      "UPDATE trades SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?"
    ).run(t.id);
  }
  send(res, 200, { ok: true });
});

// --- Trades ---

app.post('/api/trades', requireAuth, (req, res) => {
  const { listing_id, offer_type, offer_coins, offer_listing_id, message } = req.body || {};
  const listing = db.prepare("SELECT * FROM listings WHERE id = ?").get(Number(listing_id));
  if (!listing) return send(res, 404, { error: 'listing not found' });
  if (listing.status !== 'active') return send(res, 400, { error: 'listing not available' });
  if (listing.user_id === req.user.id) return send(res, 400, { error: 'cannot trade with yourself' });

  if (!['coins', 'listing'].includes(offer_type))
    return send(res, 400, { error: "offer_type must be 'coins' or 'listing'" });

  let offerCoins = 0;
  let offerListingId = null;

  if (offer_type === 'coins') {
    offerCoins = Number(offer_coins);
    if (!Number.isInteger(offerCoins) || offerCoins <= 0)
      return send(res, 400, { error: 'offer_coins must be a positive integer' });
    if (req.user.coins < offerCoins)
      return send(res, 400, { error: 'insufficient coins' });
  } else {
    const oid = Number(offer_listing_id);
    const offered = db.prepare('SELECT * FROM listings WHERE id = ?').get(oid);
    if (!offered) return send(res, 404, { error: 'offered listing not found' });
    if (offered.user_id !== req.user.id)
      return send(res, 400, { error: 'offered listing must be yours' });
    if (offered.status !== 'active')
      return send(res, 400, { error: 'offered listing is not active' });
    if (offered.id === listing.id)
      return send(res, 400, { error: 'cannot offer the same listing' });
    offerListingId = offered.id;
  }

  const info = db
    .prepare(
      `INSERT INTO trades
       (listing_id, proposer_id, owner_id, offer_type, offer_coins, offer_listing_id, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      listing.id,
      req.user.id,
      listing.user_id,
      offer_type,
      offerCoins,
      offerListingId,
      (message || '').slice(0, 500)
    );
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(info.lastInsertRowid);
  send(res, 201, trade);
});

function hydrateTrade(t) {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(t.listing_id);
  const proposer = db.prepare('SELECT id, username FROM users WHERE id = ?').get(t.proposer_id);
  const owner = db.prepare('SELECT id, username FROM users WHERE id = ?').get(t.owner_id);
  let offerListing = null;
  if (t.offer_listing_id) {
    offerListing = db.prepare('SELECT * FROM listings WHERE id = ?').get(t.offer_listing_id);
  }
  return { ...t, listing, proposer, owner, offer_listing: offerListing };
}

app.get('/api/trades', requireAuth, (req, res) => {
  const role = req.query.role === 'owner' ? 'owner' : req.query.role === 'proposer' ? 'proposer' : 'all';
  let rows;
  if (role === 'owner') {
    rows = db
      .prepare('SELECT * FROM trades WHERE owner_id = ? ORDER BY created_at DESC')
      .all(req.user.id);
  } else if (role === 'proposer') {
    rows = db
      .prepare('SELECT * FROM trades WHERE proposer_id = ? ORDER BY created_at DESC')
      .all(req.user.id);
  } else {
    rows = db
      .prepare(
        'SELECT * FROM trades WHERE owner_id = ? OR proposer_id = ? ORDER BY created_at DESC'
      )
      .all(req.user.id, req.user.id);
  }
  send(res, 200, rows.map(hydrateTrade));
});

app.post('/api/trades/:id/accept', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const run = db.transaction(() => {
    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
    if (!trade) throw { status: 404, error: 'trade not found' };
    if (trade.owner_id !== req.user.id) throw { status: 403, error: 'only the listing owner can accept' };
    if (trade.status !== 'pending') throw { status: 400, error: 'trade is not pending' };

    const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(trade.listing_id);
    if (!listing || listing.status !== 'active')
      throw { status: 400, error: 'listing is no longer available' };

    if (trade.offer_type === 'coins') {
      const proposer = db.prepare('SELECT coins FROM users WHERE id = ?').get(trade.proposer_id);
      if (proposer.coins < trade.offer_coins)
        throw { status: 400, error: 'proposer no longer has enough coins' };
      recordTransaction(trade.proposer_id, -trade.offer_coins, 'trade_payment', trade.id);
      recordTransaction(trade.owner_id, trade.offer_coins, 'trade_earning', trade.id);
    } else {
      const offered = db.prepare('SELECT * FROM listings WHERE id = ?').get(trade.offer_listing_id);
      if (!offered || offered.status !== 'active')
        throw { status: 400, error: 'offered listing is no longer active' };
      db.prepare("UPDATE listings SET status = 'traded' WHERE id = ?").run(offered.id);
    }

    db.prepare("UPDATE listings SET status = 'traded' WHERE id = ?").run(listing.id);
    db.prepare(
      "UPDATE trades SET status = 'accepted', resolved_at = datetime('now') WHERE id = ?"
    ).run(trade.id);

    // Auto-reject other pending trades for the main listing and (if swap) for the offered listing.
    db.prepare(
      `UPDATE trades SET status = 'rejected', resolved_at = datetime('now')
       WHERE listing_id = ? AND status = 'pending' AND id != ?`
    ).run(listing.id, trade.id);
    if (trade.offer_listing_id) {
      db.prepare(
        `UPDATE trades SET status = 'rejected', resolved_at = datetime('now')
         WHERE (listing_id = ? OR offer_listing_id = ?) AND status = 'pending' AND id != ?`
      ).run(trade.offer_listing_id, trade.offer_listing_id, trade.id);
    }
  });

  try {
    run();
  } catch (e) {
    if (e && e.status) return send(res, e.status, { error: e.error });
    throw e;
  }
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  send(res, 200, hydrateTrade(trade));
});

app.post('/api/trades/:id/reject', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  if (!trade) return send(res, 404, { error: 'trade not found' });
  if (trade.owner_id !== req.user.id)
    return send(res, 403, { error: 'only the listing owner can reject' });
  if (trade.status !== 'pending') return send(res, 400, { error: 'trade is not pending' });
  db.prepare(
    "UPDATE trades SET status = 'rejected', resolved_at = datetime('now') WHERE id = ?"
  ).run(id);
  send(res, 200, { ok: true });
});

app.post('/api/trades/:id/cancel', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  if (!trade) return send(res, 404, { error: 'trade not found' });
  if (trade.proposer_id !== req.user.id)
    return send(res, 403, { error: 'only the proposer can cancel' });
  if (trade.status !== 'pending') return send(res, 400, { error: 'trade is not pending' });
  db.prepare(
    "UPDATE trades SET status = 'cancelled', resolved_at = datetime('now') WHERE id = ?"
  ).run(id);
  send(res, 200, { ok: true });
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

// --- Earning coins ---
// A lightweight "daily claim" so users can earn coins even without trading.
app.post('/api/wallet/daily', requireAuth, (req, res) => {
  const last = db
    .prepare(
      `SELECT created_at FROM transactions
       WHERE user_id = ? AND reason = 'daily_claim'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(req.user.id);
  if (last) {
    const hoursSince = (Date.now() - new Date(last.created_at.replace(' ', 'T') + 'Z').getTime()) / 36e5;
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
