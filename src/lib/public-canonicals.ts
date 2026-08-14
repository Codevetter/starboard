/**
 * Self-canonical paths for every public sitemap route.
 *
 * Single source of truth shared by `src/app/sitemap.ts`, the per-route
 * `alternates.canonical` metadata, and the sitemap/canonical contract test
 * (`src/__tests__/sitemap.test.ts`). Each value is an exact, extensionless
 * self-canonical — no `.html`/`.md` suffixes, no cross-route redirects — so the
 * canonical URL for a route is the route itself.
 *
 * Astro-served static pages (home, changelog) are overlaid into OpenNext
 * assets as `index.html` / `changelog.html`; their canonical is produced at
 * build time by `landing-astro/src/lib/canonical.ts` (`canonicalPath`), which
 * strips the `.html` suffix and normalizes `/index` → `/`. The values here
 * mirror that result so the contract test can assert parity without rendering.
 */
export const PUBLIC_CANONICALS = {
  home: '/',
  discover: '/discover',
  projectPreview: '/project-preview',
  tools: '/tools',
  catalogUpdates: '/catalog-updates',
  changelog: '/changelog',
  about: '/about',
  privacy: '/privacy',
  terms: '/terms',
} as const;

/** Ordered list of every public sitemap route's self-canonical path. */
export const PUBLIC_CANONICAL_PATHS = Object.values(PUBLIC_CANONICALS);
