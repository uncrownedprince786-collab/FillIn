/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * NOTE: On Vercel serverless this is per-instance memory and is not a strong
 * global limit. It is a pragmatic baseline; a durable limiter (e.g. Upstash
 * Redis) is a documented future upgrade.
 */

interface Bucket {
  timestamps: number[];
  lastCleanup: number;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40;
const CLEANUP_EVERY = 100;
const buckets = new Map<string, Bucket>();
let operations = 0;

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
}

export function rateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [], lastCleanup: now };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < WINDOW_MS);

  if (bucket.timestamps.length >= MAX_REQUESTS) {
    const oldest = bucket.timestamps[0] ?? now;
    buckets.set(key, bucket);
    return { ok: false, retryAfterMs: Math.max(0, oldest + WINDOW_MS - now) };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);

  operations += 1;
  if (operations % CLEANUP_EVERY === 0) {
    for (const [k, b] of buckets) {
      b.timestamps = b.timestamps.filter((t) => now - t < WINDOW_MS);
      if (b.timestamps.length === 0) buckets.delete(k);
    }
  }
  return { ok: true, retryAfterMs: 0 };
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
}