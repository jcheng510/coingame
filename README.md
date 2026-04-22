# CoinGame — Barter Marketplace

A web app for bartering **time**, **items**, and **services** using an in-app coin currency.

- Sign up (username + email + password) and get a **100-coin starter balance**.
- Verify your email (dev mode shows the verify link in-browser and server logs; swap in SMTP for production).
- Earn more coins by selling time/items/services or **claiming 20 coins every 24 hours**.
- Post listings with a real-world value in coins. Listings can have multiple units (e.g. "5 guitar lessons at 20 coins each").
- Propose trades on others' listings. An offer can include **coins, one of your own listings, or both together**, and can request only part of a listing's quantity.
- Accept / reject / cancel trade proposals. Message the other party inside the trade.

Value transfers are ledgered per user, and state transitions happen in SQLite transactions.

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

SQLite data is persisted under `data/coingame.db`. Delete that directory to reset.

## Tech

- Node.js + Express, no build step.
- SQLite via `better-sqlite3` (single-file DB, transactional writes for trades).
- Cookie sessions, bcrypt passwords, **CSRF double-submit** tokens on all state changes.
- **In-memory rate limiting** on register/login/writes/daily-claim (swap for Redis for multi-process deployments).
- Vanilla HTML/CSS/JS frontend served from `public/`.

Dev-mode limitations: no real email delivery (verification link is printed and returned from signup), no distributed rate limiting, no CSRF cookie signing.

## API overview

All mutation endpoints require an `X-CSRF-Token` header matching the `cg_csrf` cookie.

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET  | `/api/csrf` | Ensure a CSRF cookie is set |
| POST | `/api/register` | `{username,email,password}` → 100 starter coins + verify link |
| POST | `/api/login` | `{username,password}` |
| POST | `/api/logout` | |
| GET  | `/api/me` | current user |
| GET  | `/api/verify?token=…` | marks user verified, redirects to `/?verified=1` |
| POST | `/api/resend-verification` | new verify link |
| GET  | `/api/listings` | `?mine=1&kind=time|item|service&q=text&status=…` |
| POST | `/api/listings` | verified users only |
| PATCH | `/api/listings/:id` | owner only, fails if pending trades reference the listing |
| DELETE | `/api/listings/:id` | owner cancels |
| POST | `/api/trades` | `{listing_id, quantity_requested, offer_coins, offer_listing_id, offer_quantity, message}` — at least one of coins/listing required |
| GET  | `/api/trades` | `?role=owner|proposer|all` |
| POST | `/api/trades/:id/accept` | owner only |
| POST | `/api/trades/:id/reject` | owner only |
| POST | `/api/trades/:id/cancel` | proposer only |
| GET  | `/api/trades/:id/messages` | participants only |
| POST | `/api/trades/:id/messages` | `{body}` |
| GET  | `/api/wallet` | balance + last 100 ledger entries |
| POST | `/api/wallet/daily` | once per 24h, +20 coins |

## Trade semantics

Accepting a trade runs atomically inside a DB transaction:

1. Re-validates the main listing and the offered listing (if any) are still `active` and have enough `quantity_available`.
2. If the offer includes coins, debits the proposer and credits the owner, writing ledger entries on both sides.
3. Decrements `quantity_available` on the main listing (and offered listing). When it hits zero, status flips to `traded`.
4. Auto-rejects any other pending proposals that reference a now-sold-out listing.

## File layout

- `server/db.js` — SQLite schema
- `server/auth.js` — sessions, bcrypt, CSRF middleware
- `server/rateLimit.js` — sliding-window rate limiter
- `server/index.js` — Express API + static hosting
- `public/` — SPA (index.html, app.js, styles.css)
