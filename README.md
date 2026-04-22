# CoinGame — Barter Marketplace

A small web app for bartering **time**, **items**, and **services** using an in-app coin currency. Users can:

- Sign up and get a **100-coin starting balance**.
- Earn more coins by selling their time/items/services, or by **claiming 20 coins every 24 hours**.
- Post listings with a real-world value expressed in coins (e.g. "1 hour of Spanish tutoring = 40 coins", "Used bike = 80 coins").
- Propose trades on someone else's listing in one of two ways:
  - **Pay with coins.**
  - **Swap** by offering one of your own listings instead.
- Accept / reject / cancel trade proposals. Accepting a coin trade moves coins instantly; accepting a listing swap marks both listings as traded.

All value transfers are recorded in a per-user transaction ledger so each user can see how they earned or spent.

## Run it locally

```bash
npm install
npm start
# open http://localhost:3000
```

SQLite data is persisted under `data/coingame.db`. Delete that directory to reset.

## Tech choices

- Node.js + Express, no build step.
- SQLite via `better-sqlite3` (single-file DB, transactional writes for trades).
- Cookie-based sessions, passwords hashed with bcrypt.
- Vanilla HTML/CSS/JS frontend served from `public/`.

This is a self-contained demo — not hardened for production (no rate limiting, no CSRF tokens, no email verification). Good foundation to build on.

## API overview

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST | `/api/register` | `{username, password}` → creates user, 100 starter coins |
| POST | `/api/login` | `{username, password}` |
| POST | `/api/logout` | |
| GET  | `/api/me` | current user |
| GET  | `/api/listings` | `?mine=1&kind=time|item|service&q=text` |
| POST | `/api/listings` | `{kind,title,description,unit,quantity,value_coins}` |
| DELETE | `/api/listings/:id` | owner cancels |
| POST | `/api/trades` | `{listing_id, offer_type: 'coins'\|'listing', offer_coins?, offer_listing_id?, message?}` |
| GET  | `/api/trades` | `?role=owner\|proposer\|all` |
| POST | `/api/trades/:id/accept` | owner only |
| POST | `/api/trades/:id/reject` | owner only |
| POST | `/api/trades/:id/cancel` | proposer only |
| GET  | `/api/wallet` | balance + last 100 transactions |
| POST | `/api/wallet/daily` | once per 24h, +20 coins |

## Trade semantics

Accepting a trade runs atomically inside a DB transaction:

1. Re-validates the listing (and offered listing, if a swap) is still `active`.
2. If paying with coins, debits the proposer and credits the owner, writing two ledger entries.
3. Marks the main listing (and offered listing, if any) as `traded`.
4. Auto-rejects all other pending proposals against those listings.
