import type { Client } from '@libsql/client';

import { type AlertRules, DEFAULT_ALERT_RULES, parseAlertRules } from '@/lib/alert-preferences';
import type { MaintainerDigestRepoInput } from '@/lib/maintainer-digest';
import type { RadarRepoInput } from '@/lib/release-radar';

/**
 * Per-user SQL loaders behind the weekly digest/alerts payloads.
 * Shared by the API routes (Worker runtime, @libsql/client/web) and the
 * scheduled email sender script (Node, @libsql/client) — both satisfy the
 * `execute` surface used here.
 */
export type DbExecutor = Pick<Client, 'execute'>;

export async function loadAlertRules(db: DbExecutor, userId: string): Promise<AlertRules> {
  const result = await db.execute({
    sql: 'SELECT rules FROM user_alert_preferences WHERE user_id = ?',
    args: [userId],
  });
  if (result.rows.length === 0) return { ...DEFAULT_ALERT_RULES };
  return parseAlertRules(result.rows[0]!.rules as string);
}

export async function loadRadarRepos(db: DbExecutor, userId: string): Promise<RadarRepoInput[]> {
  const result = await db.execute({
    sql: `SELECT r.id,
                 r.name,
                 r.full_name,
                 r.owner_login,
                 r.owner_avatar,
                 r.html_url,
                 r.description,
                 r.language,
                 r.stargazers_count,
                 r.archived,
                 r.topics,
                 r.repo_updated_at,
                 ur.starred_at,
                 (
                   SELECT rss.stargazers_count
                   FROM repo_star_snapshots rss
                   WHERE rss.repo_id = r.id
                     AND datetime(rss.captured_at) <= datetime('now', '-30 days')
                   ORDER BY datetime(rss.captured_at) DESC
                   LIMIT 1
                 ) AS stars_30d_ago,
                 (
                   SELECT COUNT(*)
                   FROM repo_threshold_events rte
                   WHERE rte.repo_id = r.id
                     AND datetime(rte.crossed_at) >= datetime('now', '-30 days')
                 ) AS threshold_events_30d
          FROM user_repos ur
          JOIN repos r ON r.id = ur.repo_id
          WHERE ur.user_id = ?
            AND (ur.is_starred = 1 OR ur.is_saved = 1)
          ORDER BY r.repo_updated_at DESC, r.stargazers_count DESC
          LIMIT 500`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    fullName: row.full_name as string,
    ownerLogin: row.owner_login as string,
    ownerAvatar: row.owner_avatar as string,
    htmlUrl: row.html_url as string,
    description: row.description as string | null,
    language: row.language as string | null,
    stargazersCount: row.stargazers_count as number,
    archived: Boolean(row.archived),
    topics: JSON.parse((row.topics as string) || '[]'),
    repoUpdatedAt: row.repo_updated_at as string | null,
    starredAt: row.starred_at as string | null,
    starsThirtyDaysAgo: row.stars_30d_ago as number | null,
    thresholdEventsThirtyDays: row.threshold_events_30d as number,
  }));
}

export async function loadMaintainerRepos(
  db: DbExecutor,
  userId: string
): Promise<MaintainerDigestRepoInput[]> {
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
    args: [userId],
  });

  return result.rows.map((row) => ({
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
}
