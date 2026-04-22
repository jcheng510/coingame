const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'coingame.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL,
  coins        INTEGER NOT NULL DEFAULT 100,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token        TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('time','item','service')),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  unit         TEXT NOT NULL DEFAULT 'piece',
  quantity     INTEGER NOT NULL DEFAULT 1,
  value_coins  INTEGER NOT NULL CHECK (value_coins >= 0),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','traded','cancelled')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_user ON listings(user_id);

CREATE TABLE IF NOT EXISTS trades (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id          INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  proposer_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_type          TEXT NOT NULL CHECK (offer_type IN ('coins','listing')),
  offer_coins         INTEGER NOT NULL DEFAULT 0 CHECK (offer_coins >= 0),
  offer_listing_id    INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  message             TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','rejected','cancelled','completed')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_trades_owner ON trades(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_trades_proposer ON trades(proposer_id, status);

CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta         INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason        TEXT NOT NULL,
  trade_id      INTEGER REFERENCES trades(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, created_at DESC);
`);

module.exports = db;
