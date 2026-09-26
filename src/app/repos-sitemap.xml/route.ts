import { db } from '@/db';

const siteUrl = 'https://starboard.codevetter.com';

export const dynamic = 'force-dynamic';

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET() {
  let rows: Record<string, unknown>[] = [];
  try {
    const result = await db.execute({
      sql: 'SELECT full_name, repo_updated_at FROM repos WHERE archived = 0 ORDER BY stargazers_count DESC',
    });
    rows = result.rows;
  } catch {
    // Serve an empty urlset rather than 500 — crawlers retry later.
  }
  const entries = rows
    .map((row) => {
      const loc = `${siteUrl}/explore/${escapeXml(String(row.full_name))}`;
      const updated = row.repo_updated_at ? String(row.repo_updated_at).slice(0, 10) : null;
      return `  <url><loc>${loc}</loc>${updated ? `<lastmod>${updated}</lastmod>` : ''}<changefreq>weekly</changefreq></url>`;
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
