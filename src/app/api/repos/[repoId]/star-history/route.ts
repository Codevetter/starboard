import { NextResponse } from 'next/server';

import { db } from '@/db';
import { calculateStarGrowth } from '@/lib/star-growth';

export async function GET(request: Request, { params }: { params: Promise<{ repoId: string }> }) {
  const { repoId: rawId } = await params;
  const repoId = parseInt(rawId, 10);
  if (!Number.isInteger(repoId)) {
    return NextResponse.json({ error: 'Invalid repo ID' }, { status: 400 });
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '180', 10), 1), 730);
  const result = await db.execute({
    sql: `SELECT stargazers_count, captured_at
          FROM repo_star_snapshots
          WHERE repo_id = ?
            AND datetime(captured_at) >= datetime('now', ?)
          ORDER BY datetime(captured_at) ASC`,
    args: [repoId, `-${days} days`],
  });

  const points = result.rows.map((row) => ({
    stargazersCount: row.stargazers_count as number,
    capturedAt: row.captured_at as string,
  }));

  return NextResponse.json({
    repoId,
    days,
    points,
    growth: calculateStarGrowth(points),
  });
}
