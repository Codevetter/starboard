import { db } from '@/db';
import { listPublicToolDefinitions } from '@/lib/repo-tools';
import { STATIC_PUBLIC_ROUTES } from '@/lib/public-markdown';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  const url = new URL(request.url);
  if (
    ['cookie', 'authorization', 'cf-access-jwt-assertion', 'rsc'].some((key) =>
      request.headers.has(key)
    ) ||
    [...url.searchParams.keys()].some((key) => key !== 'offset')
  )
    return Response.json({ error: 'Public only' }, { status: 404, headers });
  const raw = url.searchParams.get('offset') ?? '0';
  if (!/^\d{1,9}$/.test(raw))
    return Response.json({ error: 'Invalid offset' }, { status: 400, headers });
  const offset = Number(raw);
  try {
    const rows = await db.execute({
      sql: `SELECT path, title, description FROM (
 SELECT '/explore/' || full_name AS path, full_name AS title, COALESCE(description,'Public GitHub repository') AS description FROM repos
 UNION ALL SELECT '/tools/' || tool_key AS path, MAX(tool_name) AS title, 'Public repository tool evidence' AS description FROM repo_tools rt JOIN repos r ON r.id=rt.repo_id WHERE category != 'language' AND r.stargazers_count >= 10000 GROUP BY tool_key
 UNION ALL SELECT '/lists/' || slug AS path, name AS title, COALESCE(description,'Publicly shared repository list') AS description FROM user_lists WHERE is_public = 1 AND slug IS NOT NULL
 ) ORDER BY path LIMIT 201 OFFSET ?`,
      args: [offset],
    });
    const knownTools = listPublicToolDefinitions().map((tool) => ({
      path: `/tools/${encodeURIComponent(tool.key)}`,
      title: tool.name,
      description: 'Public repository tool evidence',
      full: false,
    }));
    const knownPaths = new Set(knownTools.map((tool) => tool.path));
    const dynamic = rows.rows
      .slice(0, 200)
      .filter((row) => !knownPaths.has(String(row.path)))
      .map((row) => ({
        path: row.path,
        title: row.title,
        description: row.description,
        full: false,
      }));
    return Response.json(
      {
        routes: [...(offset === 0 ? [...STATIC_PUBLIC_ROUTES, ...knownTools] : []), ...dynamic],
        nextOffset: rows.rows.length > 200 ? offset + 200 : null,
      },
      { headers }
    );
  } catch {
    return Response.json({ error: 'Public catalog unavailable' }, { status: 503, headers });
  }
}
