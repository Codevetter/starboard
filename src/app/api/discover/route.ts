import type { InStatement, InValue } from '@/db/client';
import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { generateEmbeddings } from '@/lib/embeddings';
import { mapRepoBaseRow } from '@/lib/repo-row-mapper';
import { repoVectors } from '@/lib/repo-vectors';
import { expandedSearchQuery, ftsSearchQuery, rrfFuse } from '@/lib/search';

const MIN_STARS_FLOOR = 5000;
const SEMANTIC_TOP_K = 100;
const SEMANTIC_DISTANCE_MAX = 0.7;
// Index-friendly eligibility filter. The previous form
//   (r.stargazers_count >= ? OR EXISTS (SELECT 1 FROM user_repos ...))
// forced SQLite to evaluate a correlated subquery against user_repos for
// every repo row, defeating idx_repos_stars and scanning user_repos once
// per repo (O(|repos| × |user_repos|) row reads per request). The IN (UNION)
// form lets each branch use its own index (idx_repos_stars and
// idx_user_repos_repo) and dedupes via UNION.
const ELIGIBLE_REPO_SQL =
  'r.id IN (SELECT r2.id FROM repos r2 WHERE r2.stargazers_count >= ? UNION SELECT community_ur.repo_id FROM user_repos community_ur WHERE community_ur.is_starred = 1)';
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

interface DiscoverParams {
  q: string | null;
  languages: string[];
  toolKeys: string[];
  listId: string | null;
  sort: string;
  limit: number;
  offset: number;
}

function parseDiscoverParams(params: URLSearchParams): DiscoverParams {
  const q = params.get('q')?.trim() || null;
  return {
    q,
    languages: params.get('language')?.split(',').filter(Boolean) || [],
    toolKeys:
      params
        .get('tool')
        ?.split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) || [],
    listId: params.get('list_id'),
    sort: params.get('sort') || (q ? 'relevance' : 'stars'),
    limit: Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 200),
    offset: Math.max(parseInt(params.get('offset') || '0', 10) || 0, 0),
  };
}

async function resolveSearchIds(
  q: string,
  whereClauses: string[],
  whereArgs: InValue[]
): Promise<number[] | null> {
  const lexicalQuery = ftsSearchQuery(q);
  const lexIdsPromise = lexicalQuery
    ? db
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
    : Promise.resolve([] as number[]);

  const semanticIdsPromise = (async () => {
    try {
      const [embedding] = await generateEmbeddings([expandedSearchQuery(q)]);
      if (!embedding) return [];
      const matches = await repoVectors().query(embedding, SEMANTIC_TOP_K);
      return matches
        .filter((match) => match.distance <= SEMANTIC_DISTANCE_MAX)
        .map((match) => match.repoId);
    } catch (error) {
      console.warn('Discover semantic retrieval unavailable; using lexical search', error);
      return [];
    }
  })();

  const [lexIds, semanticIds] = await Promise.all([lexIdsPromise, semanticIdsPromise]);
  const searchIds = rrfFuse([semanticIds, lexIds]);

  if (searchIds.length > 0) {
    whereClauses.push('r.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))');
    whereArgs.push(JSON.stringify(searchIds));
    return searchIds;
  }
  whereClauses.push('0 = 1');
  return null;
}

function applyFilters(
  p: DiscoverParams,
  userId: bigint | null,
  whereClauses: string[],
  whereArgs: InValue[]
): NextResponse | null {
  if (p.languages.length > 0) {
    whereClauses.push('r.language IN (SELECT CAST(value AS TEXT) FROM json_each(?))');
    whereArgs.push(JSON.stringify(p.languages));
  }

  if (p.toolKeys.length > 0) {
    whereClauses.push(
      `EXISTS (SELECT 1 FROM repo_tools selected_tools
               WHERE selected_tools.repo_id = r.id
                 AND selected_tools.tool_key IN (
                   SELECT CAST(value AS TEXT) FROM json_each(?)
                 ))`
    );
    whereArgs.push(JSON.stringify(p.toolKeys));
  }

  if (p.listId !== null) {
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required for list filters' },
        { status: 401 }
      );
    }
    const parsedListId = parseInt(p.listId, 10);
    if (!Number.isInteger(parsedListId)) {
      return NextResponse.json({ error: 'Invalid list_id' }, { status: 400 });
    }
    whereClauses.push(
      'EXISTS (SELECT 1 FROM user_repo_lists url WHERE url.user_id = ? AND url.repo_id = r.id AND url.list_id = ?)'
    );
    whereArgs.push(userId);
    whereArgs.push(parsedListId);
  }
  return null;
}

const ORDER_BY_MAP: Record<string, string> = {
  relevance: 'r.stargazers_count DESC',
  stars: 'r.stargazers_count DESC',
  updated: 'r.repo_updated_at DESC, r.stargazers_count DESC',
  name: 'r.name ASC',
  starred: 'r.stargazers_count DESC',
  growth: 'star_growth_30d DESC, r.stargazers_count DESC',
};

function buildOrderBy(sort: string, rankedRepoIds: number[] | null): string {
  if (rankedRepoIds && rankedRepoIds.length > 0 && sort === 'relevance') {
    const caseLines = rankedRepoIds.map((id, i) => `WHEN ${id} THEN ${i}`).join(' ');
    return `CASE r.id ${caseLines} ELSE 999999 END`;
  }
  return ORDER_BY_MAP[sort] || ORDER_BY_MAP.stars;
}

function buildFacetQueries(userId: bigint | null): InStatement[] {
  const languageFacetQuery: InStatement = {
    sql: `SELECT r.language, COUNT(*) as count
          FROM repos r
          WHERE ${ELIGIBLE_REPO_SQL} AND r.language IS NOT NULL AND r.language != ''
          GROUP BY r.language
          ORDER BY count DESC`,
    args: [MIN_STARS_FLOOR],
  };

  const listFacetQuery: InStatement = userId
    ? {
        sql: `SELECT ul.id, ul.name, ul.color, COUNT(r.id) as count
              FROM user_lists ul
              LEFT JOIN user_repo_lists url ON url.list_id = ul.id AND url.user_id = ul.user_id
              LEFT JOIN repos r ON r.id = url.repo_id AND ${ELIGIBLE_REPO_SQL}
              WHERE ul.user_id = ?
              GROUP BY ul.id
              ORDER BY ul.position ASC`,
        args: [MIN_STARS_FLOOR, userId],
      }
    : {
        sql: 'SELECT NULL AS id, NULL AS name, NULL AS color, 0 AS count WHERE 0 = 1',
        args: [],
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

  return [languageFacetQuery, listFacetQuery, toolFacetQuery];
}

function mapDiscoverRepo(row: Record<string, unknown>) {
  return {
    ...mapRepoBaseRow(row),
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
  };
}

export async function GET(request: NextRequest) {
  let session = null;
  try {
    session = await auth();
  } catch {
    // Discover is public. An unavailable auth session must not take the guest
    // catalogue down with it; authenticated-only filters still fail closed.
    console.warn('Discover auth unavailable; serving guest response');
  }
  const userId = session?.user?.githubId ?? null;
  const p = parseDiscoverParams(request.nextUrl.searchParams);

  const whereClauses: string[] = [ELIGIBLE_REPO_SQL];
  const whereArgs: InValue[] = [MIN_STARS_FLOOR];

  let rankedRepoIds: number[] | null = null;
  if (p.q) {
    rankedRepoIds = await resolveSearchIds(p.q, whereClauses, whereArgs);
  }

  const filterError = applyFilters(p, userId, whereClauses, whereArgs);
  if (filterError) return filterError;

  const whereSQL = whereClauses.join(' AND ');
  const orderBy = buildOrderBy(p.sort, rankedRepoIds);

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
      args: [userId, userId, ...whereArgs, p.limit, p.offset],
    };

    const countQuery: InStatement = {
      sql: `SELECT COUNT(*) as total
            FROM repos r
            LEFT JOIN user_repos ur ON ur.user_id = ? AND ur.repo_id = r.id
            WHERE ${whereSQL}`,
      args: [userId, ...whereArgs],
    };

    const [languageFacetQuery, listFacetQuery, toolFacetQuery] = buildFacetQueries(userId);

    const [mainResult, batchResults] = await Promise.all([
      db.execute(mainQuery),
      db.batch([countQuery, languageFacetQuery, listFacetQuery, toolFacetQuery]),
    ]);

    const [countResult, langResult, listResult, toolResult] = batchResults;

    const repos = mainResult.rows.map((row) => mapDiscoverRepo(row as Record<string, unknown>));
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
