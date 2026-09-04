/**
 * Scraper guard for the programmatic explore pages and their JSON APIs.
 *
 * Between 2026-08-30 and 2026-09-03 a distributed scraper (mostly the
 * `Lightpanda/1.0` headless browser, ~7,700 rotating IPs) walked
 * `/explore/<owner>/<repo>` and the `/api/repos/*` endpoints behind it. Those
 * requests execute JavaScript, so they also counted as visits in Cloudflare
 * Web Analytics and fired PostHog events.
 *
 * This guard is deliberately narrow: it only refuses user agents that identify
 * themselves as automation frameworks, and only on the guarded prefixes.
 * Verified search engines (Googlebot, Bingbot, DuckDuckBot, ...) never match
 * these patterns and stay allowed, as do llms.txt, /api/ai and every other
 * agent-readable surface. UA-spoofing scrapers need a Cloudflare WAF managed
 * challenge; that cannot be expressed in application code.
 */

const GUARDED_PREFIXES = ['/explore/', '/api/repos/'];

const AUTOMATION_UA_RE =
  /Lightpanda|HeadlessChrome|PhantomJS|Puppeteer|Playwright|python-requests|python-httpx|aiohttp|Go-http-client|Scrapy|node-fetch|axios\/|okhttp|curl\/|wget\//i;

export function isGuardedPath(pathname: string): boolean {
  return GUARDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isAutomationUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim();
  if (ua.length === 0) return true;
  return AUTOMATION_UA_RE.test(ua);
}

/**
 * True when the request should be refused with 403 before it reaches Next.js.
 */
export function shouldBlockScraper(pathname: string, userAgent: string | null | undefined): boolean {
  return isGuardedPath(pathname) && isAutomationUserAgent(userAgent);
}
