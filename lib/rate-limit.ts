/**
 * Fixed-window rate limiter held in memory. Best effort: on serverless each instance has its own counters,
 * so this blunts bursts and simple abuse; durable limits (like the per-email resend cooldown) live in the database.
 */
export interface RateLimiter {
  /** Returns true when the call is allowed, false when the key is over its limit. */
  allow(key: string, now?: number): boolean;
}

export function createRateLimiter(opts: {
  windowMs: number;
  max: number;
  maxKeys?: number;
}): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const maxKeys = opts.maxKeys ?? 10_000;
  return {
    allow(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (hits.size >= maxKeys) {
          // Drop expired entries first; if still full, drop the oldest so memory stays bounded.
          for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
          if (hits.size >= maxKeys) hits.delete(hits.keys().next().value as string);
        }
        hits.set(key, { count: 1, resetAt: now + opts.windowMs });
        return true;
      }
      if (entry.count >= opts.max) return false;
      entry.count++;
      return true;
    },
  };
}

/** Client IP from standard proxy headers (first hop), or "unknown". */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}
