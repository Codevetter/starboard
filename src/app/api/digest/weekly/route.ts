import { NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { buildMaintainerDigest, type MaintainerDigestRepoInput } from '@/lib/maintainer-digest';

export async function GET() {
  const session = await auth();

  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await db.execute({
    sql: `SELECT r.id,
                 r.name,
                 r.full_name,
                 r.html_url,
                 r.description,
                 r.language,
                 r.stargazers_count,
                 r.archived,
                 r.repo_updated_at,
                 ur.starred_at,
                 ur.is_starred,
                 ur.is_saved,
                 ur.notes,
                 (
                   SELECT COUNT(*)
                   FROM user_repo_lists url
                   WHERE url.user_id = ur.user_id
                     AND url.repo_id = ur.repo_id
                 ) AS collection_count,
                 (
                   SELECT rss.stargazers_count
                   FROM repo_star_snapshots rss
                   WHERE rss.repo_id = r.id
                     AND datetime(rss.captured_at) <= datetime('now', '-7 days')
                   ORDER BY datetime(rss.captured_at) DESC
                   LIMIT 1
                 ) AS stars_7d_ago,
                 (
                   SELECT COUNT(*)
                   FROM repo_threshold_events rte
                   WHERE rte.repo_id = r.id
                     AND datetime(rte.crossed_at) >= datetime('now', '-7 days')
                 ) AS threshold_events_7d
          FROM user_repos ur
          JOIN repos r ON r.id = ur.repo_id
          WHERE ur.user_id = ?
            AND (ur.is_starred = 1 OR ur.is_saved = 1)
          ORDER BY ur.starred_at DESC, r.stargazers_count DESC
          LIMIT 500`,
    args: [session.user.githubId],
  });

  const repos: MaintainerDigestRepoInput[] = result.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    fullName: row.full_name as string,
    htmlUrl: row.html_url as string,
    description: row.description as string | null,
    language: row.language as string | null,
    stargazersCount: row.stargazers_count as number,
    archived: Boolean(row.archived),
    repoUpdatedAt: row.repo_updated_at as string | null,
    starredAt: row.starred_at as string | null,
    isStarred: Boolean(row.is_starred),
    isSaved: Boolean(row.is_saved),
    notes: row.notes as string | null,
    collectionCount: row.collection_count as number,
    starsSevenDaysAgo: row.stars_7d_ago as number | null,
    thresholdEventsSevenDays: row.threshold_events_7d as number,
  }));

  return NextResponse.json(buildMaintainerDigest(repos));
}
