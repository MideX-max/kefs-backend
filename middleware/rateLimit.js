export function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map();

  return function rateLimiter(req, res, next) {
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : String(forwardedFor || req.ip || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const key = `${ip}:${req.originalUrl}`;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.expiresAt <= now) {
      hits.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ message });
    }

    return next();
  };
}
