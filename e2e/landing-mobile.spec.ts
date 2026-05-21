import { expect, test } from "@playwright/test";

/**
 * Mobile-viewport smoke test for the public landing page.
 *
 * Runs under both the `desktop` and `mobile` Playwright projects (see
 * playwright.config.ts). The `mobile` project uses a 390px iPhone 13
 * viewport — the fleet mobile target — so layout regressions there fail CI.
 *
 * The landing page is the only route reachable without GitHub auth, so the
 * primary signed-in flow (the virtualized repo grid) is verified manually
 * against the mobile conventions doc.
 */
test.describe("landing page", () => {
  test("renders the hero and key sections with no horizontal scroll", async ({
    page,
  }) => {
    await page.goto("/");

    // Hero value prop is visible.
    await expect(
      page.getByRole("heading", { name: "Starboard", level: 1 }),
    ).toBeVisible();

    // The three feature cards are present.
    await expect(page.getByText("Filter", { exact: true })).toBeVisible();
    await expect(page.getByText("Discover", { exact: true })).toBeVisible();
    await expect(page.getByText("Organize", { exact: true })).toBeVisible();

    // The single primary CTA is reachable.
    await expect(
      page.getByRole("button", { name: /sign in with github/i }),
    ).toBeVisible();

    // No horizontal scroll — the page must never scroll sideways.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("the primary CTA is a large enough touch target", async ({ page }) => {
    await page.goto("/");
    const cta = page.getByRole("button", { name: /sign in with github/i });
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    // WCAG 2.5.5 / iOS HIG: tap targets must be at least 44x44px.
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
