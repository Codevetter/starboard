import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import sitemap from '@/app/sitemap';
import { PUBLISHED_ARTICLE_SLUGS } from '@/data/published-articles';
import { PUBLIC_CANONICALS, PUBLIC_CANONICAL_PATHS } from '@/lib/public-canonicals';
import { canonicalPath } from '../../landing-astro/src/lib/canonical';

const siteUrl = 'https://starboard.codevetter.com';

// The sitemap reads the generated slug manifest; verify it cannot drift from
// the markdown pages that actually exist under landing-astro.
const articleDir = path.join(process.cwd(), 'landing-astro', 'src', 'pages', 'articles');
const onDiskSlugs = existsSync(articleDir)
  ? readdirSync(articleDir)
      .filter((file) => file.endsWith('.md'))
      .sort()
      .map((file) => file.replace(/\.md$/, ''))
  : [];
const articlePaths = PUBLISHED_ARTICLE_SLUGS.map((slug) => `/articles/${slug}`);

describe('sitemap / canonical contract', () => {
  it('keeps the generated slug manifest in sync with the markdown pages', () => {
    expect([...PUBLISHED_ARTICLE_SLUGS]).toEqual(onDiskSlugs);
  });

  it('advertises only real public routes in canonical order', () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      `${siteUrl}/`,
      `${siteUrl}/discover`,
      `${siteUrl}/project-preview`,
      `${siteUrl}/tools`,
      `${siteUrl}/catalog-updates`,
      `${siteUrl}/changelog`,
      `${siteUrl}/articles`,
      ...articlePaths.map((articlePath) => `${siteUrl}${articlePath}`),
      `${siteUrl}/about`,
      `${siteUrl}/privacy`,
      `${siteUrl}/terms`,
    ]);
  });

  it('gives every sitemap URL an exact, extensionless self-canonical', () => {
    // Every sitemap pathname must be a registered canonical, and every
    // registered canonical must appear in the sitemap — no drift either way.
    // Dynamic article routes join the registered static canonicals here.
    const sitemapPaths = sitemap().map((entry) => new URL(entry.url).pathname);
    expect(sitemapPaths.sort()).toEqual([...PUBLIC_CANONICAL_PATHS, ...articlePaths].sort());

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
