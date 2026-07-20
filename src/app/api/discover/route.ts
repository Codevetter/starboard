import type { InStatement, InValue } from '@libsql/client';
import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { ftsSearchQuery } from '@/lib/search';

const MIN_STARS_FLOOR = 5000;
const ELIGIBLE_REPO_SQL =
  '(r.stargazers_count >= ? OR EXISTS (SELECT 1 FROM user_repos community_ur WHERE community_ur.repo_id = r.id AND community_ur.is_starred = 1))';
const STAR_GROWTH_30D_SQL = `CASE
  WHEN (SELECT COUNT(*) FROM repo_star_snapshots count_snapshots
        WHERE count_snapshots.repo_id = r.id
          AND count_snapshots.captured_at >= datetime('now', '-30 days')) >= 2
  THEN
    (SELECT latest.stargazers_count FROM repo_star_snapshots latest
     WHERE latest.repo_id = r.id AND latest.captured_at >= datetime('now', '-30 days')
     ORDER BY latest.captured_at DESC LIMIT 1)
    -
    (SELECT earliest.stargazers_count FROM repo_star_snapshots earliest
     WHERE earliest.repo_id = r.id AND earliest.captured_at >= datetime('now', '-30 days')
     ORDER BY earliest.captured_at ASC LIMIT 1)
  ELSE NULL
END`;

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.githubId;
  const params = request.nextUrl.searchParams;

  const q = params.get('q')?.trim() || null;
  const languages = params.get('language')?.split(',').filter(Boolean) || [];
  const toolKeys =
    params
      .get('tool')
      ?.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) || [];
  const listId = params.get('list_id');
  const sort = params.get('sort') || 'stars';
  const limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(params.get('offset') || '0', 10) || 0, 0);

  const whereClauses: string[] = [ELIGIBLE_REPO_SQL];
  const whereArgs: InValue[] = [MIN_STARS_FLOOR];

  let rankedRepoIds: number[] | null = null;
  if (q) {
    const lexicalQuery = ftsSearchQuery(q);
    const lexIds = lexicalQuery
      ? await db
          .execute({
            sql: `SELECT r.id,
                       MIN(rank) AS best_rank
                FROM (
                  SELECT repos_fts.rowid AS id,
                         bm25(repos_fts, 10.0, 14.0, 3.0, 1.5, 2.5) AS rank
                  FROM repos_fts
                  WHERE repos_fts MATCH ?
                  UNION ALL
                  SELECT repo_ai_metadata_fts.rowid AS id,
                         bm25(repo_ai_metadata_fts, 4.0, 3.0, 2.0, 2.0, 2.5) AS rank
                  FROM repo_ai_metadata_fts
                  WHERE repo_ai_metadata_fts MATCH ?
                ) matches
                JOIN repos r ON r.id = matches.id
                WHERE ${ELIGIBLE_REPO_SQL}
                GROUP BY r.id
                ORDER BY best_rank ASC, r.stargazers_count DESC
                LIMIT 500`,
            args: [lexicalQuery, lexicalQuery, MIN_STARS_FLOOR],
          })
          .then((result) => result.rows.map((r) => r.id as number))
      : [];

    if (lexIds.length > 0) {
      rankedRepoIds = lexIds;
      const placeholders = lexIds.map(() => '?').join(', ');
      whereClauses.push(`r.id IN (${placeholders})`);
      whereArgs.push(...lexIds);
    } else {
      whereClauses.push('0 = 1');
    }
  }

  if (languages.length > 0) {
    const placeholders = languages.map(() => '?').join(', ');
    whereClauses.push(`r.language IN (${placeholders})`);
    whereArgs.push(...languages);
  }

  if (toolKeys.length > 0) {
    const placeholders = toolKeys.map(() => '?').join(', ');
    whereClauses.push(
      `EXISTS (SELECT 1 FROM repo_tools selected_tools
               WHERE selected_tools.repo_id = r.id
                 AND selected_tools.tool_key IN (${placeholders}))`
    );
    whereArgs.push(...toolKeys);
  }

  if (listId !== null) {
    const parsedListId = parseInt(listId, 10);
    if (!Number.isInteger(parsedListId)) {
      return NextResponse.json({ error: 'Invalid list_id' }, { status: 400 });
    }
    whereClauses.push(
      'EXISTS (SELECT 1 FROM user_repo_lists url WHERE url.user_id = ? AND url.repo_id = r.id AND url.list_id = ?)'
    );
    whereArgs.push(userId);
    whereArgs.push(parsedListId);
  }

  const whereSQL = whereClauses.join(' AND ');
  const useRankedOrder = rankedRepoIds && rankedRepoIds.length > 0 && sort === 'relevance';
  const orderByMap: Record<string, string> = {
    relevance: 'r.stargazers_count DESC',
    stars: 'r.stargazers_count DESC',
    updated: 'r.repo_updated_at DESC, r.stargazers_count DESC',
    name: 'r.name ASC',
    starred: 'r.stargazers_count DESC',
    growth: 'star_growth_30d DESC, r.stargazers_count DESC',
  };
  let orderBy: string;
  if (useRankedOrder) {
    const caseLines = rankedRepoIds!.map((id, i) => `WHEN ${id} THEN ${i}`).join(' ');
    orderBy = `CASE r.id ${caseLines} ELSE 999999 END`;
  } else {
    orderBy = orderByMap[sort] || orderByMap.stars;
  }

  try {
    const mainQuery: InStatement = {
      sql: `SELECT r.*,
                   ${STAR_GROWTH_30D_SQL} AS star_growth_30d,
                   ur.list_id,
                   ur.notes,
                   ur.starred_at,
                   COALESCE(ur.is_starred, 0) AS is_starred,
                   COALESCE(ur.is_saved, 0) AS is_saved,
                   COALESCE((
                     SELECT json_group_array(url.list_id)
                     FROM user_repo_lists url
                     WHERE url.user_id = ? AND url.repo_id = r.id
                   ), '[]') AS collection_ids
            FROM repos r
            LEFT JOIN user_repos ur ON ur.user_id = ? AND ur.repo_id = r.id
            WHERE ${whereSQL}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?`,
      args: [userId, userId, ...whereArgs, limit, offset],
    };

    const countQuery: InStatement = {
      sql: `SELECT COUNT(*) as total
            FROM repos r
            LEFT JOIN user_repos ur ON ur.user_id = ? AND ur.repo_id = r.id
            WHERE ${whereSQL}`,
      args: [userId, ...whereArgs],
    };

    const languageFacetQuery: InStatement = {
      sql: `SELECT r.language, COUNT(*) as count
            FROM repos r
            WHERE ${ELIGIBLE_REPO_SQL} AND r.language IS NOT NULL AND r.language != ''
            GROUP BY r.language
            ORDER BY count DESC`,
      args: [MIN_STARS_FLOOR],
    };

    const listFacetQuery: InStatement = {
      sql: `SELECT ul.id, ul.name, ul.color, COUNT(r.id) as count
            FROM user_lists ul
            LEFT JOIN user_repo_lists url ON url.list_id = ul.id AND url.user_id = ul.user_id
            LEFT JOIN repos r ON r.id = url.repo_id AND ${ELIGIBLE_REPO_SQL}
            WHERE ul.user_id = ?
            GROUP BY ul.id
            ORDER BY ul.position ASC`,
      args: [MIN_STARS_FLOOR, userId],
    };

    const toolFacetQuery: InStatement = {
      sql: `SELECT rt.tool_key, rt.tool_name, COUNT(DISTINCT rt.repo_id) AS count
            FROM repo_tools rt
            JOIN repos r ON r.id = rt.repo_id
            WHERE ${ELIGIBLE_REPO_SQL}
            GROUP BY rt.tool_key, rt.tool_name
            ORDER BY count DESC, rt.tool_name ASC
            LIMIT 40`,
      args: [MIN_STARS_FLOOR],
    };

    const [mainResult, batchResults] = await Promise.all([
      db.execute(mainQuery),
      db.batch([countQuery, languageFacetQuery, listFacetQuery, toolFacetQuery]),
    ]);

    const [countResult, langResult, listResult, toolResult] = batchResults;

    const repos = mainResult.rows.map((row) => ({
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
      topics: JSON.parse((row.topics as string) || '[]'),
      created_at: row.repo_created_at as string,
      updated_at: row.repo_updated_at as string,
      list_id: row.list_id as number | null,
      collection_ids: JSON.parse((row.collection_ids as string) || '[]'),
      tags: [],
      notes: row.notes as string | null,
      starred_at: row.starred_at as string | null,
      is_starred: Boolean(row.is_starred),
      is_saved: Boolean(row.is_saved),
      star_growth_30d:
        row.star_growth_30d === null || row.star_growth_30d === undefined
          ? null
          : Number(row.star_growth_30d),
    }));

    const languages = langResult.rows.map((r) => [r.language as string, r.count as number]);
    const lists = listResult.rows.map((r) => ({
      id: r.id as number,
      name: r.name as string,
      color: r.color as string,
      count: r.count as number,
    }));
    const tools = toolResult.rows.map((r) => ({
      key: r.tool_key as string,
      name: r.tool_name as string,
      count: Number(r.count),
    }));

    return NextResponse.json({
      repos,
      total: countResult.rows[0]?.total ?? 0,
      facets: { languages, lists, tags: [], tools },
      minStars: MIN_STARS_FLOOR,
    });
  } catch (error) {
    console.error('Failed to fetch discover repos:', error);
    return NextResponse.json({ error: 'Failed to fetch discover repos' }, { status: 500 });
  }
}
