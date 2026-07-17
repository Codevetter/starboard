import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const siteUrl = 'https://starboard.codevetter.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = [
    { path: '', priority: 1, changeFrequency: 'weekly' as const },
    { path: '/discover', priority: 0.9, changeFrequency: 'daily' as const },
    { path: '/explore', priority: 0.9, changeFrequency: 'daily' as const },
    { path: '/stack-builder', priority: 0.8, changeFrequency: 'weekly' as const },
    { path: '/stars', priority: 0.75, changeFrequency: 'daily' as const },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/llms.txt', priority: 0.4, changeFrequency: 'weekly' as const },
    { path: '/index.md', priority: 0.4, changeFrequency: 'weekly' as const },
    { path: '/api/ai', priority: 0.35, changeFrequency: 'weekly' as const },
  ];

  return paths.map(({ path, priority, changeFrequency }) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
