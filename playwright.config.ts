/**
 * Browser coverage for both production surfaces:
 * - the Astro landing page that is overlaid at `/` during `build:cf`
 * - the Next.js application shell and public product journeys
 */
import { defineConfig, devices } from '@playwright/test';

const appPort = process.env.STARBOARD_E2E_PORT ?? '8787';
const appURL = `http://127.0.0.1:${appPort}`;
const browserPreview = `pnpm exec wrangler d1 migrations apply starboard-e2e --local --config wrangler.e2e.jsonc --persist-to .wrangler/e2e-state --env-file /dev/null && pnpm exec wrangler d1 execute starboard-e2e --local --config wrangler.e2e.jsonc --persist-to .wrangler/e2e-state --env-file /dev/null --file e2e/fixtures/public-repo.sql && pnpm exec wrangler dev --config wrangler.e2e.jsonc --port ${appPort} --persist-to .wrangler/e2e-state --env-file /dev/null --var AUTH_SECRET:starboard-browser-test-secret-at-least-32-characters --var AUTH_GITHUB_ID:browser-test-client --var AUTH_GITHUB_SECRET:browser-test-secret`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  maxFailures: process.env.CI ? 3 : undefined,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
  webServer: {
    command: process.env.CI ? browserPreview : `pnpm build:e2e && ${browserPreview}`,
    url: appURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  projects: [
    {
      name: 'tablet',
      testMatch: /(?:public-app|landing-mobile)\.spec\.ts/,
      use: {
        browserName: 'chromium',
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
        baseURL: appURL,
      },
    },
    ...(['firefox', 'webkit'] as const).flatMap((browserName) => [
      {
        name: `${browserName}-desktop`,
        testMatch: /(?:public-app|landing-mobile)\.spec\.ts/,
        use: { browserName, viewport: { width: 1440, height: 900 }, baseURL: appURL },
      },
      {
        name: `${browserName}-phone`,
        testMatch: /(?:public-app|landing-mobile)\.spec\.ts/,
        use: {
          browserName,
          viewport: { width: 390, height: 844 },
          hasTouch: true,
          ...(browserName === 'webkit' ? { isMobile: true } : {}),
          baseURL: appURL,
        },
      },
    ]),
    {
      name: 'desktop',
      testMatch: /public-app\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: appURL },
    },
    {
      name: 'mobile',
      testMatch: /public-app\.spec\.ts/,
      use: { ...devices['iPhone 13'], baseURL: appURL, browserName: 'chromium' },
    },
    {
      name: 'landing-desktop',
      testMatch: /landing-mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: appURL },
    },
    {
      name: 'landing-mobile',
      testMatch: /landing-mobile\.spec\.ts/,
      use: { ...devices['iPhone 13'], baseURL: appURL, browserName: 'chromium' },
    },
  ],
});
