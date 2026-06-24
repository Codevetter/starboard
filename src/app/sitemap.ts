import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const siteUrl = 'https://starboard.workers.dev';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: siteUrl, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/discover`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${siteUrl}/explore`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    {
      url: `${siteUrl}/stack-builder`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ];
}
