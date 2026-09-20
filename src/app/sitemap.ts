import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type { MetadataRoute } from 'next';

import { PUBLIC_CANONICALS } from '@/lib/public-canonicals';

export const dynamic = 'force-static';

// Article pages are Astro markdown files under landing-astro; enumerate them
// at build time so the sitemap tracks published posts without a second list.
const articleDir = path.join(process.cwd(), 'landing-astro', 'src', 'pages', 'articles');
const articlePaths = existsSync(articleDir)
  ? readdirSync(articleDir)
      .filter((file) => file.endsWith('.md'))
      .sort()
      .map((file) => `/articles/${file.replace(/\.md$/, '')}`)
  : [];

const siteUrl = 'https://starboard.codevetter.com';

// Per-route metadata. `path` is the exact self-canonical from PUBLIC_CANONICALS;
// the sitemap URL is built from it so the sitemap and canonical never drift.
const routeMeta: {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}[] = [
  { path: PUBLIC_CANONICALS.home, changeFrequency: 'weekly', priority: 1 },
  { path: PUBLIC_CANONICALS.discover, changeFrequency: 'daily', priority: 0.95 },
  { path: PUBLIC_CANONICALS.projectPreview, changeFrequency: 'weekly', priority: 0.98 },
  { path: PUBLIC_CANONICALS.tools, changeFrequency: 'weekly', priority: 0.9 },
  { path: PUBLIC_CANONICALS.catalogUpdates, changeFrequency: 'daily', priority: 0.85 },
  { path: PUBLIC_CANONICALS.changelog, changeFrequency: 'monthly', priority: 0.65 },
  { path: PUBLIC_CANONICALS.articles, changeFrequency: 'weekly', priority: 0.7 },
  ...articlePaths.map((articlePath) => ({
    path: articlePath,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  })),
  { path: PUBLIC_CANONICALS.about, changeFrequency: 'monthly', priority: 0.55 },
  { path: PUBLIC_CANONICALS.privacy, changeFrequency: 'yearly', priority: 0.3 },
  { path: PUBLIC_CANONICALS.terms, changeFrequency: 'yearly', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return routeMeta.map(({ path, changeFrequency, priority }) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
