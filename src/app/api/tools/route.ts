import type { InValue } from '@libsql/client';
import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { getToolDefinition, getToolUrl, TOOL_ACCURACY_DISCLAIMER } from '@/lib/repo-tools';

type ToolScope = 'user' | 'discover' | 'all';

function parseScope(value: string | null): ToolScope {
  return value === 'user' || value === 'all' ? value : 'discover';
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

function parseLanguages(value: string | null): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(',')
        .map((language) => language.trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
}

function languageClause(languages: string[]) {
  if (languages.length === 0) {
    return {
      where: '',
      args: [] as InValue[],
    };
  }

  return {
    where: `r.language IN (${languages.map(() => '?').join(', ')})`,
    args: languages as InValue[],
  };
}

async function loadLanguageFacets({
  scopeSql,
  minConfidence,
  tool,
}: {
  scopeSql: NonNullable<ReturnType<typeof scopeClause>>;
  minConfidence: number;
  tool?: string | null;
}) {
  const result = await db.execute({
    sql: `SELECT r.language,
                 COUNT(DISTINCT rt.repo_id) AS repo_count
          FROM repo_tools rt
          JOIN repos r ON r.id = rt.repo_id
          ${scopeSql.join}
          WHERE rt.confidence >= ?
            ${tool ? 'AND rt.tool_key = ?' : ''}
            AND ${scopeSql.where}
            AND r.language IS NOT NULL
            AND r.language != ''
          GROUP BY r.language
          ORDER BY repo_count DESC, r.language ASC
          LIMIT 40`,
    args: [
      ...scopeSql.joinArgs,
      minConfidence,
      ...(tool ? ([tool] as InValue[]) : []),
      ...scopeSql.whereArgs,
    ],
  });

  return result.rows.map((row) => ({
    language: row.language as string,
    repoCount: row.repo_count as number,
  }));
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const params = request.nextUrl.searchParams;
  const scope = parseScope(params.get('scope'));
  const minConfidence = Math.min(
    Math.max(parseInt(params.get('min_confidence') || '0', 10) || 0, 0),
    100
  );
  const minStars = Math.max(parseInt(params.get('min_stars') || '10000', 10) || 10000, 0);
  const limit = Math.min(Math.max(parseInt(params.get('limit') || '80', 10) || 80, 1), 500);
  const tool = params.get('tool')?.trim() || null;
  const languages = parseLanguages(params.get('languages') ?? params.get('language'));
  const scopeSql = scopeClause(scope, session?.user?.githubId ?? null, minStars);

  if (!scopeSql) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const languageSql = languageClause(languages);
  const languageFilter = languageSql.where ? `AND ${languageSql.where}` : '';
  const languageFacets = await loadLanguageFacets({ scopeSql, minConfidence, tool });

  if (tool) {
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
              AND ${scopeSql.where}
              ${languageFilter}
            GROUP BY rt.tool_key, rt.tool_name, rt.category`,
      args: [...scopeSql.joinArgs, tool, minConfidence, ...scopeSql.whereArgs, ...languageSql.args],
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
              AND ${scopeSql.where}
              ${languageFilter}
            ORDER BY rt.confidence DESC, r.stargazers_count DESC
            LIMIT ?`,
      args: [
        ...scopeSql.joinArgs,
        tool,
        minConfidence,
        ...scopeSql.whereArgs,
        ...languageSql.args,
        limit,
      ],
    });

    return NextResponse.json({
      scope,
      minStars,
      minConfidence,
      languages,
      languageFacets,
      disclaimer: TOOL_ACCURACY_DISCLAIMER,
      tool: {
        toolKey: (summaryRow?.tool_key as string | undefined) ?? definition?.key ?? tool,
        toolName: (summaryRow?.tool_name as string | undefined) ?? definition?.name ?? tool,
        category: (summaryRow?.category as string | undefined) ?? definition?.category ?? 'library',
        url: getToolUrl((summaryRow?.tool_key as string | undefined) ?? definition?.key ?? tool),
        repoCount: (summaryRow?.repo_count as number | undefined) ?? 0,
        avgConfidence: summaryRow ? Math.round(summaryRow.avg_confidence as number) : 0,
        maxConfidence: (summaryRow?.max_confidence as number | undefined) ?? 0,
      },
      repos: result.rows.map((row) => ({
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
      })),
    });
  }

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
            AND ${scopeSql.where}
            ${languageFilter}
          GROUP BY rt.tool_key, rt.tool_name, rt.category
          ORDER BY repo_count DESC, avg_confidence DESC, rt.tool_name ASC
          LIMIT ?`,
    args: [...scopeSql.joinArgs, minConfidence, ...scopeSql.whereArgs, ...languageSql.args, limit],
  });

  return NextResponse.json({
    scope,
    minStars,
    minConfidence,
    languages,
    languageFacets,
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
