import { describe, expect, it } from 'vitest';

import {
  type HeaderReader,
  isAutomationUserAgent,
  isGuardedPath,
  isSpoofedBrowser,
  shouldBlockScraper,
} from '@/lib/bot-guard';

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const OLD_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; rv:143.0) Gecko/20100101 Firefox/143.0';
const OLD_FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15';
const GOOGLEBOT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/128.0.0.0 Safari/537.36';
const BINGBOT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.0.0 Safari/537.36';

const withHints: HeaderReader = {
  get: (name) => (name === 'sec-ch-ua' ? '"Chromium";v="150", "Not?A_Brand";v="8"' : null),
};
const noHints: HeaderReader = { get: () => null };

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
    expect(isAutomationUserAgent('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0')).toBe(
      true
    );
    expect(isAutomationUserAgent('')).toBe(true);
    expect(isAutomationUserAgent(null)).toBe(true);
  });

  it('never flags real browsers or verified search crawlers as automation', () => {
    expect(isAutomationUserAgent(CHROME)).toBe(false);
    expect(isAutomationUserAgent(GOOGLEBOT)).toBe(false);
    expect(isAutomationUserAgent(BINGBOT)).toBe(false);
    expect(isAutomationUserAgent(FIREFOX)).toBe(false);
  });

  it('treats a Chromium UA without client hints as spoofed', () => {
    expect(isSpoofedBrowser(CHROME, noHints)).toBe(true);
    expect(isSpoofedBrowser(CHROME, withHints)).toBe(false);
  });

  it('treats retired browser versions as spoofed even with hints', () => {
    expect(isSpoofedBrowser(OLD_CHROME, withHints)).toBe(true);
    expect(isSpoofedBrowser(OLD_FIREFOX, noHints)).toBe(true);
    expect(isSpoofedBrowser(FIREFOX, noHints)).toBe(false);
  });

  it('leaves Safari and known crawlers alone', () => {
    expect(isSpoofedBrowser(SAFARI, noHints)).toBe(false);
    expect(isSpoofedBrowser(GOOGLEBOT, noHints)).toBe(false);
    expect(isSpoofedBrowser(BINGBOT, noHints)).toBe(false);
  });

  it('blocks only when both the path and the agent match', () => {
    expect(shouldBlockScraper('/explore/krayin/laravel-crm', 'Lightpanda/1.0')).toBe(true);
    expect(shouldBlockScraper('/api/repos/42', 'Lightpanda/1.0')).toBe(true);
    expect(shouldBlockScraper('/explore/krayin/laravel-crm', OLD_CHROME, withHints)).toBe(true);
    expect(shouldBlockScraper('/explore/krayin/laravel-crm', CHROME, noHints)).toBe(true);
    expect(shouldBlockScraper('/explore/krayin/laravel-crm', CHROME, withHints)).toBe(false);
    expect(shouldBlockScraper('/explore/krayin/laravel-crm', SAFARI, noHints)).toBe(false);
    expect(shouldBlockScraper('/explore/krayin/laravel-crm', GOOGLEBOT, noHints)).toBe(false);
    expect(shouldBlockScraper('/discover', 'Lightpanda/1.0')).toBe(false);
    expect(shouldBlockScraper('/discover', CHROME, noHints)).toBe(false);
    expect(shouldBlockScraper('/api/ai', 'python-requests/2.32')).toBe(false);
  });
});
