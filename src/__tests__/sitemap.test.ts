import { describe, expect, it } from 'vitest';

import sitemap from '@/app/sitemap';
import { PUBLIC_CANONICALS, PUBLIC_CANONICAL_PATHS } from '@/lib/public-canonicals';
import { canonicalPath } from '../../landing-astro/src/lib/canonical';

const siteUrl = 'https://starboard.codevetter.com';

describe('sitemap / canonical contract', () => {
  it('advertises only real public routes in canonical order', () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      `${siteUrl}/`,
      `${siteUrl}/discover`,
      `${siteUrl}/project-preview`,
      `${siteUrl}/tools`,
      `${siteUrl}/catalog-updates`,
      `${siteUrl}/changelog`,
      `${siteUrl}/about`,
      `${siteUrl}/privacy`,
      `${siteUrl}/terms`,
    ]);
  });

  it('gives every sitemap URL an exact, extensionless self-canonical', () => {
    // Every sitemap pathname must be a registered canonical, and every
    // registered canonical must appear in the sitemap — no drift either way.
    const sitemapPaths = sitemap().map((entry) => new URL(entry.url).pathname);
    expect(sitemapPaths.sort()).toEqual([...PUBLIC_CANONICAL_PATHS].sort());

    // Each canonical is self-referential and carries no file extension.
    for (const path of PUBLIC_CANONICAL_PATHS) {
      expect(path).not.toMatch(/\.(html|md|php)$/);
      expect(path === '/' || path.startsWith('/')).toBe(true);
      expect(path.includes('//')).toBe(false);
    }
  });

  it('covers the seven public surfaces named in the canonical contract', () => {
    expect(PUBLIC_CANONICALS.home).toBe('/');
    expect(PUBLIC_CANONICALS.discover).toBe('/discover');
    expect(PUBLIC_CANONICALS.projectPreview).toBe('/project-preview');
    expect(PUBLIC_CANONICALS.tools).toBe('/tools');
    expect(PUBLIC_CANONICALS.changelog).toBe('/changelog');
    expect(PUBLIC_CANONICALS.privacy).toBe('/privacy');
    expect(PUBLIC_CANONICALS.terms).toBe('/terms');
  });

  it('maps Astro .html overlays to the registered extensionless canonicals', () => {
    // Astro-served static pages are overlaid into OpenNext assets as
    // index.html / changelog.html. canonicalPath must produce the same path
    // registered in PUBLIC_CANONICALS so the built canonical matches the
    // sitemap entry exactly.
    expect(canonicalPath('/index.html')).toBe(PUBLIC_CANONICALS.home);
    expect(canonicalPath('/changelog.html')).toBe(PUBLIC_CANONICALS.changelog);
    expect(canonicalPath('/discover.html')).toBe(PUBLIC_CANONICALS.discover);
    expect(canonicalPath('/tools.html')).toBe(PUBLIC_CANONICALS.tools);
    expect(canonicalPath('/privacy.html')).toBe(PUBLIC_CANONICALS.privacy);
    expect(canonicalPath('/terms.html')).toBe(PUBLIC_CANONICALS.terms);
  });
});
