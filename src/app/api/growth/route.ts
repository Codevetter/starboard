import type { InValue } from '@libsql/client';
import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';

type GrowthScope = 'user' | 'discover' | 'all';

function parseScope(value: string | null): GrowthScope {
  return value === 'user' || value === 'all' ? value : 'discover';
}

function scopeClause(scope: GrowthScope, userId: string, minStars: number) {
  if (scope === 'user') {
    return {
      join: 'JOIN user_repos ur ON ur.repo_id = r.id',
      where: 'ur.user_id = ? AND (ur.is_starred = 1 OR ur.is_saved = 1)',
      joinArgs: [] as InValue[],
      whereArgs: [userId] as InValue[],
    };
  }
  if (scope === 'all') {
    return {
      join: 'LEFT JOIN user_repos ur ON ur.repo_id = r.id AND ur.user_id = ?',
      where: '(r.stargazers_count >= ? OR ur.user_id IS NOT NULL)',
      joinArgs: [userId] as InValue[],
      whereArgs: [minStars] as InValue[],
    };
  }
  return {
    join: '',
    where: 'r.stargazers_count >= ?',
    joinArgs: [] as InValue[],
    whereArgs: [minStars] as InValue[],
  };
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const scope = parseScope(params.get('scope'));
  const days = Math.min(Math.max(parseInt(params.get('days') || '30', 10) || 30, 1), 365);
  const minStars = Math.max(parseInt(params.get('min_stars') || '10000', 10) || 10000, 0);
  const limit = Math.min(Math.max(parseInt(params.get('limit') || '30', 10) || 30, 1), 100);
  const scopeSql = scopeClause(scope, session.user.githubId, minStars);

  const result = await db.execute({
    sql: `WITH recent AS (
            SELECT repo_id,
                   MIN(datetime(captured_at)) AS first_at,
                   MAX(datetime(captured_at)) AS last_at
            FROM repo_star_snapshots
            WHERE datetime(captured_at) >= datetime('now', ?)
            GROUP BY repo_id
          ),
          first_rows AS (
            SELECT s.repo_id, s.stargazers_count, s.captured_at
            FROM repo_star_snapshots s
            JOIN recent ON recent.repo_id = s.repo_id
             AND datetime(s.captured_at) = recent.first_at
          ),
          last_rows AS (
            SELECT s.repo_id, s.stargazers_count, s.captured_at
            FROM repo_star_snapshots s
            JOIN recent ON recent.repo_id = s.repo_id
             AND datetime(s.captured_at) = recent.last_at
          )
          SELECT r.id,
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
                 first_rows.stargazers_count AS first_stars,
                 first_rows.captured_at AS first_at,
                 last_rows.stargazers_count AS last_stars,
                 last_rows.captured_at AS last_at,
                 last_rows.stargazers_count - first_rows.stargazers_count AS stars_gained
          FROM recent
          JOIN first_rows ON first_rows.repo_id = recent.repo_id
          JOIN last_rows ON last_rows.repo_id = recent.repo_id
          JOIN repos r ON r.id = recent.repo_id
          ${scopeSql.join}
          WHERE last_rows.stargazers_count > first_rows.stargazers_count
            AND ${scopeSql.where}
          ORDER BY stars_gained DESC, r.stargazers_count DESC
          LIMIT ?`,
    args: [`-${days} days`, ...scopeSql.joinArgs, ...scopeSql.whereArgs, limit],
  });

  return NextResponse.json({
    scope,
    days,
    minStars,
    repos: result.rows.map((row) => {
      const firstStars = row.first_stars as number;
      const starsGained = row.stars_gained as number;
      return {
        id: row.id as number,
        name: row.name as string,
        full_name: row.full_name as string,
        owner: {
          login: row.owner_login as string,
          avatar_url: row.owner_avatar as string,
        },
        html_url: row.html_url as string,
        description: row.description as string | null,
        language: row.language as string | null,
        stargazers_count: row.stargazers_count as number,
        archived: Boolean(row.archived),
        topics: JSON.parse((row.topics as string) || '[]') as string[],
        starsGained,
        percentGrowth: firstStars > 0 ? (starsGained / firstStars) * 100 : null,
        firstSnapshot: {
          stargazersCount: firstStars,
          capturedAt: row.first_at as string,
        },
        lastSnapshot: {
          stargazersCount: row.last_stars as number,
          capturedAt: row.last_at as string,
        },
      };
    }),
  });
}
