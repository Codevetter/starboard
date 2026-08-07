/**
 * Intentionally disabled.
 *
 * Starboard previously used a Cloudflare Workers rate-limit binding that
 * false-positived on normal first-session traffic (OAuth + first sync).
 * Keep this stub so any leftover import fails open instead of 429-ing users.
 *
 * Do not re-enable without explicit approval and endpoint-specific evidence.
 * See fleet agent standards on rate-limit conservatism.
 */
export async function isRateLimited(_key: string): Promise<boolean> {
  return false;
}
