import { expect, test } from '@playwright/test';

test.describe('production Astro landing page', () => {
  test('renders the hero and key sections with no horizontal scroll', async ({
    page,
  }, testInfo) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', {
        name: 'Discover better tools for the project you’re building.',
        level: 1,
      })
    ).toBeVisible();
    await expect(
      page.getByText(/paste a public github repository\. starboard finds similar projects/i)
    ).toBeVisible();

    const repository = page.getByRole('textbox', { name: /public github repository/i });
    await expect(repository).toBeVisible();
    await expect(page.getByRole('button', { name: /preview project/i })).toBeVisible();

    await expect(page.getByRole('link', { name: /browse discover instead/i })).toHaveAttribute(
      'href',
      '/discover'
    );

    // No horizontal scroll — the page must never scroll sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);

    if (!process.env.CI && testInfo.project.name === 'landing-desktop') {
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({
          path: `.fleet/evidence/discovery-entry-clarity/after-landing-${width}.png`,
          fullPage: true,
        });
      }
    }
  });

  test('the primary CTA is a large enough touch target', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('button', { name: /preview project/i });
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('submits a repository through the public preview route', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: /public github repository/i }).fill('acme/store');
    await page.getByRole('button', { name: /preview project/i }).click();

    await expect(page).toHaveURL(/\/project-preview\?repository=acme%2Fstore$/);
  });
});
