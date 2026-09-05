/**
 * Scraper guard for the programmatic explore pages and their JSON APIs.
 *
 * Between 2026-08-30 and 2026-09-03 a distributed scraper walked
 * `/explore/<owner>/<repo>` and the `/api/repos/*` endpoints behind it from
 * ~7,700 rotating IPs. About 60% identified as `Lightpanda/1.0`; the rest
 * spoofed two-year-old desktop Chrome and Firefox user agents. Those requests
 * execute JavaScript, so they also counted as visits in Cloudflare Web
 * Analytics and fired PostHog events.
 *
 * The guard is deliberately narrow and only applies to the guarded prefixes:
 *
 * 1. Refuse user agents that identify themselves as automation frameworks.
 * 2. Refuse Chromium user agents that omit the `sec-ch-ua` client hint. Every
 *    Chromium build since 89 sends the low-entropy hint on navigations; a
 *    Chrome UA without it is a spoofed string.
 * 3. Refuse browser versions that no longer exist in the wild (Chrome older
 *    than 130, Firefox older than the 128 ESR line), which is what the
 *    spoofing set used.
 *
 * Known search, social and AI crawlers are exempt from 2 and 3: they present
 * a Chrome-like UA without client hints. llms.txt, /api/ai and every other
 * agent-readable surface are outside the guarded prefixes.
 */

const GUARDED_PREFIXES = ['/explore/', '/api/repos/'];

const AUTOMATION_UA_RE =
  /Lightpanda|HeadlessChrome|PhantomJS|Puppeteer|Playwright|python-requests|python-httpx|aiohttp|Go-http-client|Scrapy|node-fetch|axios\/|okhttp|curl\/|wget\//i;

const CRAWLER_UA_RE =
  /Googlebot|Google-InspectionTool|AdsBot-Google|Storebot-Google|bingbot|BingPreview|DuckDuckBot|Applebot|YandexBot|Baiduspider|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|Discordbot|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|anthropic-ai|PerplexityBot|Bytespider/i;

/** Oldest Chrome major seen from real visitors in 2026; the scraper used 118-120. */
const MIN_CHROME_MAJOR = 130;
/** Oldest supported Firefox ESR line in 2026; the scraper used 120-121. */
const MIN_FIREFOX_MAJOR = 128;

export interface HeaderReader {
  get(name: string): string | null;
}

export function isGuardedPath(pathname: string): boolean {
  return GUARDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isAutomationUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim();
  if (ua.length === 0) return true;
  return AUTOMATION_UA_RE.test(ua);
}

function isKnownCrawler(userAgent: string | null | undefined): boolean {
  return CRAWLER_UA_RE.test(userAgent ?? '');
}

/**
 * True for a browser user agent that a real browser could not have produced:
 * a Chromium UA without client hints, or a version retired years ago.
 */
export function isSpoofedBrowser(
  userAgent: string | null | undefined,
  headers: HeaderReader
): boolean {
  const ua = userAgent ?? '';
  if (isKnownCrawler(ua)) return false;
  const chrome = /\bChrome\/(\d+)/.exec(ua);
  if (chrome) {
    if (Number(chrome[1]) < MIN_CHROME_MAJOR) return true;
    return !headers.get('sec-ch-ua');
  }
  const firefox = /\bFirefox\/(\d+)/.exec(ua);
  if (firefox) return Number(firefox[1]) < MIN_FIREFOX_MAJOR;
  return false;
}

const NO_HEADERS: HeaderReader = { get: () => null };

/**
 * True when the request should be refused with 403 before it reaches Next.js.
 */
export function shouldBlockScraper(
  pathname: string,
  userAgent: string | null | undefined,
  headers: HeaderReader = NO_HEADERS
): boolean {
  if (!isGuardedPath(pathname)) return false;
  return isAutomationUserAgent(userAgent) || isSpoofedBrowser(userAgent, headers);
}
