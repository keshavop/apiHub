// Fixed-window limiter kept in process memory. Good for a single instance;
// put it in Redis if apiHub runs on several instances.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  entry.count += 1;
  return { ok: entry.count <= limit };
}
