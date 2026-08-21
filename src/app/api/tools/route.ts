import type { InValue } from '@/db/client';
import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { getToolDefinition, getToolUrl, TOOL_ACCURACY_DISCLAIMER } from '@/lib/repo-tools';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ToolScope = 'user' | 'discover' | 'all';

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store');
  return NextResponse.json(data, { ...init, headers });
}

function parseScope(value: string | null): ToolScope {
  return value === 'user' || value === 'all' ? value : 'discover';
}

function likePattern(value: string): string {
  return `%${value.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
}

function scopeClause(scope: ToolScope, userId: string | null, minStars: number) {
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
  scope: ToolScope;
  minConfidence: number;
  minStars: number;
  tool: string | null;
  limit: number;
  offset: number;
  query: string | null;
}

function parseToolParams(params: URLSearchParams): ToolQueryParams {
  const scope = parseScope(params.get('scope'));
  const minConfidence = Math.min(
    Math.max(parseInt(params.get('min_confidence') || '0', 10) || 0, 0),
    100
  );
  const minStars = Math.max(parseInt(params.get('min_stars') || '10000', 10) || 10000, 0);
  const tool = params.get('tool')?.trim() || null;
  const limitCeiling = tool ? 100 : 500;
  return {
    scope,
    minConfidence,
    minStars,
    tool,
    limit: Math.min(Math.max(parseInt(params.get('limit') || '80', 10) || 80, 1), limitCeiling),
    offset: Math.max(parseInt(params.get('offset') || '0', 10) || 0, 0),
    query: params.get('q')?.trim().slice(0, 120) || null,
  };
}

function buildQueryFilter(query: string | null): { sql: string; args: InValue[] } {
  if (!query) return { sql: '', args: [] };
  const pattern = likePattern(query);
  return {
    sql: `AND (
           LOWER(r.full_name) LIKE ? ESCAPE '\\'
           OR LOWER(COALESCE(r.description, '')) LIKE ? ESCAPE '\\'
           OR LOWER(COALESCE(r.language, '')) LIKE ? ESCAPE '\\'
         )`,
    args: Array(3).fill(pattern),
  };
}

function mapToolRepoRow(row: Record<string, unknown>) {
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

function strVal(row: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const val = row?.[key];
  return typeof val === 'string' ? val : fallback;
}

function numVal(row: Record<string, unknown> | undefined, key: string): number {
  const val = row?.[key];
  return typeof val === 'number' ? val : 0;
}

function buildToolSummary(
  summaryRow: Record<string, unknown> | undefined,
  definition: ReturnType<typeof getToolDefinition>,
  fallbackKey: string
) {
  const toolKey = strVal(summaryRow, 'tool_key', definition?.key ?? fallbackKey);
  return {
    toolKey,
    toolName: strVal(summaryRow, 'tool_name', definition?.name ?? fallbackKey),
    category: strVal(summaryRow, 'category', definition?.category ?? 'library'),
    url: getToolUrl(toolKey),
    repoCount: numVal(summaryRow, 'repo_count'),
    avgConfidence: summaryRow ? Math.round(summaryRow.avg_confidence as number) : 0,
    maxConfidence: numVal(summaryRow, 'max_confidence'),
  };
}

async function fetchToolSummary(
  p: ToolQueryParams,
  scopeSql: NonNullable<ReturnType<typeof scopeClause>>,
  querySql: string,
  queryArgs: InValue[]
) {
  return db.execute({
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
    args: [...scopeSql.joinArgs, p.tool, p.minConfidence, ...scopeSql.whereArgs, ...queryArgs],
  });
}

async function fetchToolDetailRepos(
  p: ToolQueryParams,
  scopeSql: NonNullable<ReturnType<typeof scopeClause>>,
  querySql: string,
  queryArgs: InValue[]
) {
  return db.execute({
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
      p.tool,
      p.minConfidence,
      ...scopeSql.whereArgs,
      ...queryArgs,
      p.limit,
      p.offset,
    ],
  });
}

async function handleToolDetail(
  p: ToolQueryParams,
  scopeSql: NonNullable<ReturnType<typeof scopeClause>>
) {
  const { sql: querySql, args: queryArgs } = buildQueryFilter(p.query);
  const summary = await fetchToolSummary(p, scopeSql, querySql, queryArgs);
  const summaryRow = summary.rows[0] as Record<string, unknown> | undefined;
  const definition = getToolDefinition(p.tool!);
  const result = await fetchToolDetailRepos(p, scopeSql, querySql, queryArgs);
  const tool = buildToolSummary(summaryRow, definition, p.tool!);

  return json({
    scope: p.scope,
    minStars: p.minStars,
    minConfidence: p.minConfidence,
    disclaimer: TOOL_ACCURACY_DISCLAIMER,
    tool,
    repos: result.rows.map((row) => mapToolRepoRow(row as Record<string, unknown>)),
    page: {
      offset: p.offset,
      limit: p.limit,
      hasMore: p.offset + result.rows.length < tool.repoCount,
    },
  });
}

async function handleToolList(
  p: ToolQueryParams,
  scopeSql: NonNullable<ReturnType<typeof scopeClause>>
) {
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
    args: [...scopeSql.joinArgs, p.minConfidence, ...scopeSql.whereArgs, p.limit],
  });

  return json({
    scope: p.scope,
    minStars: p.minStars,
    minConfidence: p.minConfidence,
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
  });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const p = parseToolParams(request.nextUrl.searchParams);
  const scopeSql = scopeClause(p.scope, session?.user?.githubId ?? null, p.minStars);

  if (!scopeSql) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (p.tool) {
    return handleToolDetail(p, scopeSql);
  }

  return handleToolList(p, scopeSql);
}
