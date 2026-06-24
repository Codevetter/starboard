/**
 * Playwright config — desktop + mobile-viewport projects.
 *
 * The `mobile` project uses the iPhone 13 device descriptor (390px wide — the
 * fleet Wave 4 mobile target) so mobile-layout regressions are caught in CI
 * alongside the `desktop` baseline.
 *
 * Run only the mobile project:  pnpm exec playwright test --project=mobile
 *
 * NOTE: `@playwright/test` is not yet a dependency. Install it before running:
 *   pnpm add -D @playwright/test && pnpm exec playwright install --with-deps
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    // Desktop baseline.
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Mobile-viewport project — iPhone 13 is 390px wide, the mobile target.
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
