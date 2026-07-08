import "server-only";

// Sliding-window in-memory rate limiter. Fine for a single Render instance;
// swap for Redis/Upstash if the service ever scales horizontally.
const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowStart = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart);

  if (hits.length >= limit) {
    const retryAfterSeconds = Math.ceil((hits[0] + windowMs - now) / 1000);
    buckets.set(key, hits);
    return { allowed: false, retryAfterSeconds };
  }

  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, retryAfterSeconds: 0 };
}
