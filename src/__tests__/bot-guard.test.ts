import { describe, expect, it } from 'vitest';

import { isAutomationUserAgent, isGuardedPath, shouldBlockScraper } from '@/lib/bot-guard';

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const GOOGLEBOT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/128.0.0.0 Safari/537.36';
const BINGBOT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.0.0 Safari/537.36';

describe('bot-guard', () => {
  it('guards only the explore pages and their repo APIs', () => {
    expect(isGuardedPath('/explore/alphaSeclab/awesome-reverse-engineering')).toBe(true);
    expect(isGuardedPath('/api/repos/123/similar?limit=8')).toBe(true);
    expect(isGuardedPath('/')).toBe(false);
    expect(isGuardedPath('/discover')).toBe(false);
    expect(isGuardedPath('/api/ai')).toBe(false);
    expect(isGuardedPath('/llms.txt')).toBe(false);
    expect(isGuardedPath('/api/auth/callback/github')).toBe(false);
  });

  it('identifies the observed scraper and common automation clients', () => {
    expect(isAutomationUserAgent('Lightpanda/1.0')).toBe(true);
    expect(isAutomationUserAgent('python-requests/2.32')).toBe(true);
    expect(isAutomationUserAgent('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0')).toBe(true);
    expect(isAutomationUserAgent('')).toBe(true);
    expect(isAutomationUserAgent(null)).toBe(true);
  });

  it('never flags real browsers or verified search crawlers', () => {
    expect(isAutomationUserAgent(CHROME)).toBe(false);
    expect(isAutomationUserAgent(GOOGLEBOT)).toBe(false);
    expect(isAutomationUserAgent(BINGBOT)).toBe(false);
    expect(isAutomationUserAgent('Mozilla/5.0 (Windows NT 10.0; rv:121.0) Gecko/20100101 Firefox/121.0')).toBe(false);
  });

  it('blocks only when both the path and the agent match', () => {
    expect(shouldBlockScraper('/explore/krayin/laravel-crm', 'Lightpanda/1.0')).toBe(true);
    expect(shouldBlockScraper('/api/repos/42', 'Lightpanda/1.0')).toBe(true);
    expect(shouldBlockScraper('/explore/krayin/laravel-crm', CHROME)).toBe(false);
    expect(shouldBlockScraper('/explore/krayin/laravel-crm', GOOGLEBOT)).toBe(false);
    expect(shouldBlockScraper('/discover', 'Lightpanda/1.0')).toBe(false);
    expect(shouldBlockScraper('/api/ai', 'python-requests/2.32')).toBe(false);
  });
});
