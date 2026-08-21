import type { InValue } from '@/db/client';

import { db } from '@/db';
import { getToolDefinition, getToolUrl, TOOL_ACCURACY_DISCLAIMER } from '@/lib/repo-tools';

type ToolScope = 'user' | 'discover' | 'all';

interface ScopeSql {
  join: string;
  where: string;
  joinArgs: InValue[];
  whereArgs: InValue[];
}

export function likePattern(value: string): string {
  return `%${value.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
}

export function parseScope(value: string | null): ToolScope {
  return value === 'user' || value === 'all' ? value : 'discover';
}

export function scopeClause(
  scope: ToolScope,
  userId: string | null,
  minStars: number
): ScopeSql | null {
  if (scope === 'user') {
    if (!userId) return null;
    return {
      join: 'JOIN user_repos ur ON ur.repo_id = r.id',
      where: 'ur.user_id = ? AND (ur.is_starred = 1 OR ur.is_saved = 1)',
      joinArgs: [] as InValue[],
      whereArgs: [userId] as InValue[],
    };
  }

  if (scope === 'all') {
    if (!userId) {
      return {
        join: '',
        where: 'r.stargazers_count >= ?',
        joinArgs: [] as InValue[],
        whereArgs: [minStars] as InValue[],
      };
    }

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

interface ToolQueryParams {
  scopeSql: ScopeSql;
  tool: string;
  minConfidence: number;
  query: string | null;
  limit: number;
  offset: number;
}

function buildQueryClause(query: string | null): { sql: string; args: InValue[] } {
  if (!query) return { sql: '', args: [] };
  const sql = `AND (
       LOWER(r.full_name) LIKE ? ESCAPE '\\'
       OR LOWER(COALESCE(r.description, '')) LIKE ? ESCAPE '\\'
       OR LOWER(COALESCE(r.language, '')) LIKE ? ESCAPE '\\'
     )`;
  return { sql, args: Array(3).fill(likePattern(query)) };
}

export async function fetchToolDetail(params: ToolQueryParams) {
  const { scopeSql, tool, minConfidence, query, limit, offset } = params;
  const { sql: querySql, args: queryArgs } = buildQueryClause(query);

  const summary = await db.execute({
    sql: `SELECT rt.tool_key,
                 rt.tool_name,
                 rt.category,
                 COUNT(DISTINCT rt.repo_id) AS repo_count,
                 AVG(rt.confidence) AS avg_confidence,
                 MAX(rt.confidence) AS max_confidence
          FROM repo_tools rt
          JOIN repos r ON r.id = rt.repo_id
          ${scopeSql.join}
          WHERE rt.tool_key = ?
            AND rt.confidence >= ?
            AND rt.category != 'language'
            AND ${scopeSql.where}
            ${querySql}
          GROUP BY rt.tool_key, rt.tool_name, rt.category`,
    args: [...scopeSql.joinArgs, tool, minConfidence, ...scopeSql.whereArgs, ...queryArgs],
  });
  const summaryRow = summary.rows[0];
  const definition = getToolDefinition(tool);
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
                 r.repo_created_at,
                 r.repo_updated_at,
                 rt.tool_key,
                 rt.tool_name,
                 rt.category,
                 rt.confidence,
                 rt.sources
          FROM repo_tools rt
          JOIN repos r ON r.id = rt.repo_id
          ${scopeSql.join}
          WHERE rt.tool_key = ?
            AND rt.confidence >= ?
            AND rt.category != 'language'
            AND ${scopeSql.where}
            ${querySql}
          ORDER BY rt.confidence DESC, r.stargazers_count DESC
          LIMIT ? OFFSET ?`,
    args: [
      ...scopeSql.joinArgs,
      tool,
      minConfidence,
      ...scopeSql.whereArgs,
      ...queryArgs,
      limit,
      offset,
    ],
  });
  const repoCount = (summaryRow?.repo_count as number | undefined) ?? 0;

  return { summaryRow, definition, result, repoCount, tool };
}

interface ToolListParams {
  scopeSql: ScopeSql;
  minConfidence: number;
  limit: number;
}

export async function fetchToolList(params: ToolListParams) {
  const { scopeSql, minConfidence, limit } = params;
  const result = await db.execute({
    sql: `SELECT rt.tool_key,
                 rt.tool_name,
                 rt.category,
                 COUNT(DISTINCT rt.repo_id) AS repo_count,
                 AVG(rt.confidence) AS avg_confidence,
                 MAX(rt.confidence) AS max_confidence
          FROM repo_tools rt
          JOIN repos r ON r.id = rt.repo_id
          ${scopeSql.join}
          WHERE rt.confidence >= ?
            AND rt.category != 'language'
            AND ${scopeSql.where}
          GROUP BY rt.tool_key, rt.tool_name, rt.category
          ORDER BY repo_count DESC, avg_confidence DESC, rt.tool_name ASC
          LIMIT ?`,
    args: [...scopeSql.joinArgs, minConfidence, ...scopeSql.whereArgs, limit],
  });
  return result;
}

function mapRepoRow(row: Record<string, unknown>) {
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
    created_at: row.repo_created_at as string,
    updated_at: row.repo_updated_at as string,
    list_id: null,
    collection_ids: [],
    tags: [],
    notes: null,
    starred_at: null,
    tool: {
      toolKey: row.tool_key as string,
      toolName: row.tool_name as string,
      category: row.category as string,
      url: getToolUrl(row.tool_key as string),
      confidence: row.confidence as number,
      sources: JSON.parse((row.sources as string) || '[]') as string[],
    },
  };
}

function firstDefined<T>(...values: (T | undefined)[]): T | undefined {
  return values.find((v) => v !== undefined);
}

function buildToolSummary(
  summaryRow: Record<string, unknown> | undefined,
  definition: ReturnType<typeof getToolDefinition>,
  tool: string,
  repoCount: number
) {
  const toolKey = firstDefined(
    summaryRow?.tool_key as string | undefined,
    definition?.key,
    tool
  ) as string;
  return {
    toolKey,
    toolName: firstDefined(
      summaryRow?.tool_name as string | undefined,
      definition?.name,
      tool
    ) as string,
    category: firstDefined(
      summaryRow?.category as string | undefined,
      definition?.category,
      'library'
    ) as string,
    url: getToolUrl(toolKey),
    repoCount,
    avgConfidence: summaryRow ? Math.round(summaryRow.avg_confidence as number) : 0,
    maxConfidence: (summaryRow?.max_confidence as number | undefined) ?? 0,
  };
}

export function buildToolDetailResponse(data: {
  summaryRow: Record<string, unknown> | undefined;
  definition: ReturnType<typeof getToolDefinition>;
  result: { rows: Record<string, unknown>[] };
  repoCount: number;
  tool: string;
  scope: ToolScope;
  minStars: number;
  minConfidence: number;
  limit: number;
  offset: number;
}) {
  const {
    summaryRow,
    definition,
    result,
    repoCount,
    tool,
    scope,
    minStars,
    minConfidence,
    limit,
    offset,
  } = data;
  return {
    scope,
    minStars,
    minConfidence,
    disclaimer: TOOL_ACCURACY_DISCLAIMER,
    tool: buildToolSummary(summaryRow, definition, tool, repoCount),
    repos: result.rows.map(mapRepoRow),
    page: {
      offset,
      limit,
      hasMore: offset + result.rows.length < repoCount,
    },
  };
}

export function buildToolListResponse(data: {
  result: { rows: Record<string, unknown>[] };
  scope: ToolScope;
  minStars: number;
  minConfidence: number;
}) {
  const { result, scope, minStars, minConfidence } = data;
  return {
    scope,
    minStars,
    minConfidence,
    disclaimer: TOOL_ACCURACY_DISCLAIMER,
    tools: result.rows.map((row) => ({
      toolKey: row.tool_key as string,
      toolName: row.tool_name as string,
      category: row.category as string,
      url: getToolUrl(row.tool_key as string),
      repoCount: row.repo_count as number,
      avgConfidence: Math.round(row.avg_confidence as number),
      maxConfidence: row.max_confidence as number,
    })),
  };
}
