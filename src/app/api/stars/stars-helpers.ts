import type { InStatement, InValue } from '@/db/client';

import { db } from '@/db';
import { searchStarboardRagOrEmpty } from '@/lib/knowledgebase';
import { blendSearchIds, expandedSearchQuery, ftsSearchQuery } from '@/lib/search';

interface SearchParams {
  q: string | null;
  userId: string;
  sort: string;
}

interface WhereClause {
  clauses: string[];
  args: InValue[];
  rankedRepoIds: number[] | null;
}

export async function buildSearchWhereClause(params: SearchParams): Promise<WhereClause> {
  const { q, userId, sort } = params;
  const clauses: string[] = ['ur.user_id = ?', '(ur.is_starred = 1 OR ur.is_saved = 1)'];
  const args: InValue[] = [userId];
  let rankedRepoIds: number[] | null = null;

  if (q) {
    const lexicalQuery = ftsSearchQuery(q);
    const RRF_K = 60;
    const VEC_TOP_K = 500;
    const useSemanticSearch = sort === 'relevance';

    const lexIdsPromise = lexicalQuery
      ? db
          .execute({
            sql: `SELECT r.id,
                       MIN(rank) AS best_rank
                FROM (
                  SELECT r.id AS id,
                         bm25(repos_fts, 10.0, 14.0, 3.0, 1.5, 2.5) AS rank
                  FROM user_repos ur
                  JOIN repos r ON r.id = ur.repo_id
                  JOIN repos_fts ON repos_fts.rowid = r.id
                  WHERE ur.user_id = ?
                    AND repos_fts MATCH ?
                  UNION ALL
                  SELECT r.id AS id,
                         bm25(repo_ai_metadata_fts, 4.0, 3.0, 2.0, 2.0, 2.5) AS rank
                  FROM user_repos ur
                  JOIN repos r ON r.id = ur.repo_id
                  JOIN repo_ai_metadata_fts ON repo_ai_metadata_fts.rowid = r.id
                  WHERE ur.user_id = ?
                    AND repo_ai_metadata_fts MATCH ?
                ) matches
                JOIN repos r ON r.id = matches.id
                GROUP BY r.id
                ORDER BY best_rank ASC, r.stargazers_count DESC
                LIMIT 500`,
            args: [userId, lexicalQuery, userId, lexicalQuery],
          })
          .then((result) => result.rows.map((r) => r.id as number))
      : Promise.resolve([]);

    const semIdsPromise = useSemanticSearch
      ? searchStarboardRagOrEmpty(userId, expandedSearchQuery(q), VEC_TOP_K)
      : Promise.resolve([]);

    const [lexIds, semIds] = await Promise.all([lexIdsPromise, semIdsPromise]);
    const fused = useSemanticSearch ? blendSearchIds(lexIds, semIds, RRF_K) : lexIds;

    if (fused.length > 0) {
      rankedRepoIds = fused;
      clauses.push('r.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))');
      args.push(JSON.stringify(fused));
    } else {
      clauses.push('0 = 1');
    }
  }

  return { clauses, args, rankedRepoIds };
}

export function applyFilters(
  where: WhereClause,
  languages: string[],
  listId: string | null
): WhereClause {
  const { clauses, args } = where;
  if (languages.length > 0) {
    clauses.push('r.language IN (SELECT CAST(value AS TEXT) FROM json_each(?))');
    args.push(JSON.stringify(languages));
  }
  if (listId !== null) {
    clauses.push(
      'EXISTS (SELECT 1 FROM user_repo_lists url WHERE url.user_id = ur.user_id AND url.repo_id = ur.repo_id AND url.list_id = ?)'
    );
    args.push(parseInt(listId, 10));
  }
  return { ...where, clauses, args };
}

const orderByMap: Record<string, string> = {
  relevance: 'ur.starred_at DESC',
  starred: 'ur.starred_at DESC',
  stars: 'r.stargazers_count DESC',
  updated: 'r.repo_updated_at DESC, r.stargazers_count DESC',
  name: 'r.name ASC',
};

export function buildOrderBy(sort: string, rankedRepoIds: number[] | null): string {
  const useRankedOrder = rankedRepoIds && rankedRepoIds.length > 0 && sort === 'relevance';
  if (useRankedOrder) {
    const caseLines = rankedRepoIds!.map((id, i) => `WHEN ${id} THEN ${i}`).join(' ');
    return `CASE r.id ${caseLines} ELSE 999999 END`;
  }
  return orderByMap[sort] || orderByMap.starred;
}

interface BuildQueriesParams {
  whereSQL: string;
  whereArgs: InValue[];
  orderBy: string;
  userId: string;
  limit: number;
  offset: number;
}

export function buildQueries(params: BuildQueriesParams): {
  mainQuery: InStatement;
  countQuery: InStatement;
  languageFacetQuery: InStatement;
  listFacetQuery: InStatement;
} {
  const { whereSQL, whereArgs, orderBy, userId, limit, offset } = params;
  const mainQuery: InStatement = {
    sql: `SELECT r.*, ur.list_id, ur.notes, ur.starred_at, ur.is_starred, ur.is_saved,
                 COALESCE((
                   SELECT json_group_array(url.list_id)
                   FROM user_repo_lists url
                   WHERE url.user_id = ur.user_id AND url.repo_id = ur.repo_id
                 ), '[]') AS collection_ids
          FROM user_repos ur
          JOIN repos r ON r.id = ur.repo_id
          WHERE ${whereSQL}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?`,
    args: [...whereArgs, limit, offset],
  };

  const countQuery: InStatement = {
    sql: `SELECT COUNT(*) as total
          FROM user_repos ur
          JOIN repos r ON r.id = ur.repo_id
          WHERE ${whereSQL}`,
    args: [...whereArgs],
  };

  const languageFacetQuery: InStatement = {
    sql: `SELECT r.language, COUNT(*) as count
          FROM user_repos ur
          JOIN repos r ON r.id = ur.repo_id
          WHERE ur.user_id = ? AND (ur.is_starred = 1 OR ur.is_saved = 1) AND r.language IS NOT NULL AND r.language != ''
          GROUP BY r.language
          ORDER BY count DESC`,
    args: [userId],
  };

  const listFacetQuery: InStatement = {
    sql: `SELECT ul.id, ul.name, ul.color, COUNT(ur.repo_id) as count
          FROM user_lists ul
          LEFT JOIN user_repo_lists url ON url.list_id = ul.id AND url.user_id = ul.user_id
          LEFT JOIN user_repos ur ON ur.user_id = url.user_id AND ur.repo_id = url.repo_id AND (ur.is_starred = 1 OR ur.is_saved = 1)
          WHERE ul.user_id = ?
          GROUP BY ul.id
          ORDER BY ul.position ASC`,
    args: [userId],
  };

  return { mainQuery, countQuery, languageFacetQuery, listFacetQuery };
}

export function mapRepoRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => ({
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
    starred_at: row.starred_at as string,
    is_starred: Boolean(row.is_starred),
    is_saved: Boolean(row.is_saved),
  }));
}

export function parseStarsParams(params: URLSearchParams) {
  return {
    q: params.get('q')?.trim() || null,
    languages: params.get('language')?.split(',').filter(Boolean) || [],
    listId: params.get('list_id'),
    sort: params.get('sort') || 'starred',
    limit: Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 200),
    offset: Math.max(parseInt(params.get('offset') || '0', 10) || 0, 0),
  };
}
