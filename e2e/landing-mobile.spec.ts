import { expect, test } from '@playwright/test';

test.describe('production Astro landing page', () => {
  test('renders the hero and key sections with no horizontal scroll', async ({
    page,
  }, testInfo) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', {
        name: /find open-source tools that fit the project in front of you/i,
        level: 1,
      })
    ).toBeVisible();
    await expect(
      page.getByText(/starboard finds similar projects, then shows which tools/i)
    ).toBeVisible();

    await expect(page.getByRole('link', { name: /preview a project/i }).first()).toHaveAttribute(
      'href',
      '/project-preview'
    );
    await expect(
      page.getByRole('link', { name: /browse the public catalog/i }).first()
    ).toHaveAttribute('href', '/discover');

    await expect(page.getByText(/what starboard does not claim/i)).toBeVisible();
    await expect(
      page.locator('footer[data-fleet-footer="studio"][data-catalog-id="starboard"]')
    ).toHaveCount(1);

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
    const cta = page.getByRole('link', { name: /preview a project/i }).first();
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('opens the public preview route from the hero', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('link', { name: /preview a project/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/project-preview$/);
  });
});
