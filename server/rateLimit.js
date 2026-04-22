// Simple in-memory sliding-window rate limiter.
// Not suitable for multi-process deployments — swap for Redis in that case.

const buckets = new Map();

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
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
}

function rateLimit({ windowMs, max, keyFn, name }) {
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
