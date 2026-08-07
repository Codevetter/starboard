import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { CATALOG_UPDATES_DEFAULT_LIMIT, loadCatalogUpdates } from '@/lib/catalog-updates';

export const dynamic = 'force-dynamic';

/**
 * Public catalogue ingestion history — recently cataloged popular repos.
 * Mirrors anime-list GET /api/changelog for catalog-updates consumers.
 * The HTML page loads via RSC (not this route) to avoid edge 429 on client fetch.
 */
export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get('limit');

  try {
    const payload = await loadCatalogUpdates(db, limitParam ?? CATALOG_UPDATES_DEFAULT_LIMIT);

    return NextResponse.json(payload, {
      headers: {
        // Longer edge cache — catalogue only moves when operators seed.
        'Cache-Control': 'public, max-age=120, s-maxage=600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('catalog-updates failed:', error);
    return NextResponse.json({ error: 'Failed to load catalogue updates' }, { status: 500 });
  }
}
