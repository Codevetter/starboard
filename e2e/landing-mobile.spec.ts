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

    await expect(page.getByLabel('public github repository', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'preview project', exact: true })).toBeVisible();
    await expect(page.locator('[data-identity-form]')).toHaveAttribute(
      'action',
      '/project-preview'
    );
    await expect(page.locator('[data-identity-form]')).toHaveAttribute('method', 'get');
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
    const cta = page.getByRole('button', { name: 'preview project', exact: true });
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('rejects empty input with an accessible message', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'preview project', exact: true }).click();
    const input = page.getByLabel('public github repository', { exact: true });
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-identity-form] [role=alert]')).toHaveText(
      'Enter a public GitHub URL or owner/repository.'
    );
    await expect(page).toHaveURL(/\/$/);
  });

  test('opens the public preview route from the hero', async ({ page }) => {
    await page.goto('/');
    await page
      .getByLabel('public github repository', { exact: true })
      .fill('https://github.com/vercel/next.js');
    await page.getByRole('button', { name: 'preview project', exact: true }).click();

    await expect(page).toHaveURL(
      /\/project-preview\?repository=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js$/
    );
  });
});
