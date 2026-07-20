/**
 * Minimal in-memory rate limiter.
 *
 * Sliding-window counter per key. Good enough for a single-Worker,
 * low-traffic app where the goal is to stop one user from burst-firing
 * the Workers AI binding. For multi-isolate correctness, upgrade to a
 * Durable Object or KV-backed limiter — see AGENTS.md "Active context".
 *
 * Defaults: 5 calls per 60s window per key. Tuned for the embedding
 * generate endpoint, which is the only caller today.
 */
const WINDOW_MS = 60_000;
const MAX_CALLS = 5;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export async function isRateLimited(key: string): Promise<boolean> {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > MAX_CALLS;
}

/** Test-only: reset the limiter state. */
export function _resetRateLimiterForTests(): void {
  buckets.clear();
}
