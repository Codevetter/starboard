import { REPOSITORY_SITEMAP_COUNT } from '@/lib/public-repository-catalog';
import { XML_HEADERS } from '@/lib/repository-sitemap';
import { SITE_IDENTITY } from '@/lib/site-identity';

export const dynamic = 'force-static';
export function GET() {
  const entries = Array.from(
    { length: REPOSITORY_SITEMAP_COUNT },
    (_, id) =>
      `<sitemap><loc>${SITE_IDENTITY.origin}/sitemaps/repositories/${id}.xml</loc></sitemap>`
  ).join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`,
    { headers: XML_HEADERS }
  );
}
