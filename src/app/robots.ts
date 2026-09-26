import type { MetadataRoute } from 'next';

const siteUrl = 'https://starboard.codevetter.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/stars'],
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`, `${siteUrl}/repos-sitemap.xml`],
  };
}
