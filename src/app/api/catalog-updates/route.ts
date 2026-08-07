import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import {
  CATALOG_MIN_STARS_FLOOR,
  type CatalogChangeEntry,
  type CatalogUpdatesPayload,
} from '@/lib/catalog-updates';

export const dynamic = 'force-dynamic';

/**
 * Public catalogue ingestion history — recently cataloged popular repos.
 * Mirrors anime-list GET /api/changelog for catalog-updates UI.
 */
export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '200', 10) || 200, 1), 500);

  try {
    const [changesResult, totalResult, newestResult] = await Promise.all([
      db.execute({
        sql: `SELECT r.id,
                     r.name,
                     r.full_name,
                     r.description,
                     r.language,
                     r.stargazers_count,
                     r.owner_login,
                     r.owner_avatar,
                     r.html_url,
                     DATE(COALESCE(r.cataloged_at, r.repo_created_at, datetime('now'))) AS catalog_date
              FROM repos r
              WHERE r.stargazers_count >= ?
              ORDER BY COALESCE(r.cataloged_at, r.repo_created_at, datetime('now')) DESC
              LIMIT ?`,
        args: [CATALOG_MIN_STARS_FLOOR, limit],
      }),
      db.execute({
        sql: `SELECT COUNT(*) AS c FROM repos WHERE stargazers_count >= ?`,
        args: [CATALOG_MIN_STARS_FLOOR],
      }),
      db.execute({
        sql: `SELECT MAX(COALESCE(cataloged_at, repo_created_at)) AS newest
              FROM repos
              WHERE stargazers_count >= ?`,
        args: [CATALOG_MIN_STARS_FLOOR],
      }),
    ]);

    const changes: CatalogChangeEntry[] = changesResult.rows.map((row) => ({
      date: String(row.catalog_date ?? ''),
      id: Number(row.id),
      fullName: String(row.full_name ?? ''),
      name: String(row.name ?? ''),
      description: (row.description as string | null) ?? null,
      language: (row.language as string | null) ?? null,
      stargazersCount: Number(row.stargazers_count ?? 0) || 0,
      ownerLogin: String(row.owner_login ?? ''),
      ownerAvatar: String(row.owner_avatar ?? ''),
      htmlUrl: String(row.html_url ?? ''),
    }));

    const payload: CatalogUpdatesPayload = {
      changes,
      summary: {
        totalCatalogRepos: Number(totalResult.rows[0]?.c ?? 0) || 0,
        minStarsFloor: CATALOG_MIN_STARS_FLOOR,
        newestCatalogedAt: (newestResult.rows[0]?.newest as string | null) ?? null,
        changesReturned: changes.length,
        refreshCadence:
          'Manual seed-popular GitHub Action (auto daily schedule paused); user star sync is on-demand.',
      },
    };

    return NextResponse.json(payload, {
      headers: {
        // Short edge cache — catalogue updates when operators seed.
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('catalog-updates failed:', error);
    return NextResponse.json({ error: 'Failed to load catalogue updates' }, { status: 500 });
  }
}
