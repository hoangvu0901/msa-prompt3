const {
  redis,
  redisOperation,
} = require("../redis-client");

const script = `
  local count = redis.call('INCR', KEYS[1])

  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end

  local ttl = redis.call('TTL', KEYS[1])

  if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end

  return {count, ttl}
`;

function rateLimit(scope, limit, windowSeconds) {
  return async (req, res, next) => {
    const isHealth =
      req.method === "GET" &&
      req.path.toLowerCase().replace(/\/+$/, "") === "/api/health";

    if (isHealth) {
      return next();
    }

    if (scope === "auth") {
      const isAuth =
        /^\/api\/auth\/(?:register|login)\/?$/i.test(req.path);

      if (!isAuth) {
        return next();
      }
    }

    try {
      const key = `msa:rate:${scope}:${req.ip}`;

      const result = await redisOperation(() =>
        redis.eval(script, {
          keys: [key],
          arguments: [String(windowSeconds)],
        })
      );

      const count = Number(result[0]);
      const ttl = Math.max(1, Number(result[1]));

      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader(
        "X-RateLimit-Remaining",
        String(Math.max(0, limit - count))
      );

      if (count > limit) {
        res.setHeader("Retry-After", String(ttl));

        return res.status(429).json({
          message: "Too many requests",
          retryAfter: ttl,
        });
      }

      next();
    } catch {
      return res.status(503).json({
        message: "Rate limiting service unavailable",
      });
    }
  };
}

module.exports = { rateLimit };
