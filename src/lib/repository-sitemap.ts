import { SITE_IDENTITY } from './site-identity';
import { publicRepositoryPath } from './public-repository-admission';
import type { RepoDetail } from './repo-detail';

export const XML_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=300, s-maxage=3600',
};
export function xmlEscape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
export function repositorySitemapXml(repos: RepoDetail[]): string {
  const urls = repos
    .map((repo) => {
      const path = publicRepositoryPath(repo.full_name);
      if (!path) return '';
      // GitHub's source-updated timestamp is real source freshness. Do not
      // substitute request/build time when it is missing or malformed.
      const date = repo.repo_updated_at ? Date.parse(repo.repo_updated_at) : Number.NaN;
      const modified = Number.isFinite(date)
        ? `<lastmod>${new Date(date).toISOString()}</lastmod>`
        : '';
      return `<url><loc>${xmlEscape(SITE_IDENTITY.origin + path)}</loc>${modified}</url>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}
