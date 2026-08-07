import { describe, expect, it } from 'vitest';

import sitemap from '@/app/sitemap';

const siteUrl = 'https://starboard.codevetter.com';

describe('sitemap', () => {
  it('advertises only real public routes', () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([
      siteUrl,
      `${siteUrl}/discover`,
      `${siteUrl}/tools`,
      `${siteUrl}/catalog-updates`,
      `${siteUrl}/changelog`,
      `${siteUrl}/about`,
      `${siteUrl}/privacy`,
      `${siteUrl}/terms`,
    ]);
  });
});
