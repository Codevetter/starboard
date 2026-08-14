import { describe, expect, it } from 'vitest';

import sitemap from '@/app/sitemap';
import { PUBLIC_CANONICALS } from '@/lib/public-canonicals';
import { canonicalPath } from '../../landing-astro/src/lib/canonical';

const siteUrl = 'https://starboard.codevetter.com';

describe('sitemap', () => {
  it('advertises only real public routes', () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      siteUrl,
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

  it('keeps every shared public route on an extensionless self-canonical', () => {
    const sitemapPaths = sitemap().map((entry) => new URL(entry.url).pathname);
    expect(Object.values(PUBLIC_CANONICALS).every((path) => sitemapPaths.includes(path))).toBe(
      true
    );
    expect(canonicalPath('/index.html')).toBe('/');
    expect(canonicalPath('/changelog.html')).toBe('/changelog');
  });
});
