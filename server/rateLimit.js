// Simple in-memory sliding-window rate limiter.
// Not suitable for multi-process deployments — swap for Redis in that case.

const buckets = new Map();
// Largest window we use; the periodic sweeper drops any bucket whose newest
// entry is older than this. Bumped automatically as limiters register.
let maxWindowMs = 60 * 60 * 1000;
let sweeperStarted = false;

function startSweeper() {
  if (sweeperStarted) return;
  sweeperStarted = true;
  // Periodically drop fully-stale buckets so the map can't grow unbounded
  // when many distinct keys appear and never reappear.
  setInterval(() => {
    const cutoff = Date.now() - maxWindowMs;
    for (const [key, arr] of buckets) {
      if (arr.length === 0 || arr[arr.length - 1] <= cutoff) buckets.delete(key);
    }
  }, Math.min(maxWindowMs, 60 * 1000)).unref();
}

function prune(key, windowMs, now) {
  const arr = buckets.get(key);
  if (!arr) return [];
  const cutoff = now - windowMs;
  const kept = arr.filter((t) => t > cutoff);
  if (kept.length) buckets.set(key, kept);
  else buckets.delete(key);
  return kept;
}

function clientIp(req) {
  // Relies on Express's `trust proxy` setting being correctly configured
  // (default: off, so req.ip is the direct socket peer). Reading
  // X-Forwarded-For directly would be spoofable by any client.
  return (
    (req && req.ip) ||
    (req && Array.isArray(req.ips) && req.ips[0]) ||
    (req && req.socket && req.socket.remoteAddress) ||
    'unknown'
  );
}

function rateLimit({ windowMs, max, keyFn, name }) {
  if (windowMs > maxWindowMs) maxWindowMs = windowMs;
  startSweeper();
  return (req, res, next) => {
    const key = `${name}:${keyFn(req)}`;
    const now = Date.now();
    const hits = prune(key, windowMs, now);
    if (hits.length >= max) {
      const retryAfter = Math.ceil((hits[0] + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `Too many requests. Try again in ${retryAfter}s.`,
      });
    }
    hits.push(now);
    buckets.set(key, hits);
    next();
  };
}

module.exports = { rateLimit, clientIp };
