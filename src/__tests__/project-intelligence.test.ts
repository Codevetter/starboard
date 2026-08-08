import { describe, expect, it, vi } from 'vitest';

import type { DbResult } from '@/db/client';
import {
  createProjectIntelligence,
  type ProjectIntelligenceDependencies,
} from '@/lib/project-intelligence';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';

function result(rows: Record<string, unknown>[]): DbResult {
  return { rows, columns: [], rowsAffected: 0, lastInsertRowid: null };
}

function project(overrides: Partial<ProjectRecommendationRepo> = {}): ProjectRecommendationRepo {
  return {
    id: 1,
    name: 'checkout',
    fullName: 'acme/checkout',
    htmlUrl: 'https://github.com/acme/checkout',
    description: 'Payments orchestration for TypeScript services',
    language: 'TypeScript',
    stargazersCount: 20,
    archived: false,
    topics: ['payments'],
    aiSummary: null,
    aiCategory: null,
    aiKeywords: [],
    tools: [],
    ...overrides,
  };
}

function row(
  id: number,
  fullName: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    name: fullName.split('/')[1],
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
    description: null,
    language: 'TypeScript',
    stargazers_count: 10_000,
    archived: 0,
    topics: '[]',
    ai_summary: null,
    ai_category: null,
    ai_keywords: '[]',
    tools: '[]',
    ...overrides,
  };
}

function dependencies(
  execute: ProjectIntelligenceDependencies['database']['execute'],
  vectorOverrides: Partial<ReturnType<ProjectIntelligenceDependencies['vectorStore']>> = {}
): ProjectIntelligenceDependencies {
  return {
    database: { execute },
    vectorStore: () => ({
      query: vi.fn().mockResolvedValue([]),
      queryByRepoId: vi.fn().mockResolvedValue([]),
      ...vectorOverrides,
    }),
    embed: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  };
}

describe('project intelligence retrieval', () => {
  it('retrieves beyond a popularity prefix and reranks the evidence-rich peer first', async () => {
    const execute = vi.fn(async (statement: string | { sql: string; args?: unknown[] }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.includes('repos_fts MATCH')) return result([{ id: 900 }, { id: 2 }]);
      if (sql.includes('r.language = ? COLLATE NOCASE')) return result([{ id: 2 }, { id: 900 }]);
      if (sql.includes('json_each(?)')) {
        return result([
          row(2, 'oss/popular', { stargazers_count: 500_000 }),
          row(900, 'oss/payments-kit', {
            stargazers_count: 5_100,
            description: 'Payments orchestration toolkit',
            topics: '["payments"]',
          }),
        ]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const retrieve = createProjectIntelligence(
      dependencies(execute, {
        queryByRepoId: vi.fn().mockResolvedValue([{ repoId: 900, distance: 0.2 }]),
      })
    );

    const response = await retrieve(project(), 10);

    expect(response.retrieval).toMatchObject({ mode: 'hybrid', candidateCount: 2 });
    expect(response.similarProjects[0].fullName).toBe('oss/payments-kit');
    expect(response.similarProjects[0].stargazersCount).toBe(5_100);
    const executedSql = execute.mock.calls
      .map(([statement]) => (typeof statement === 'string' ? statement : statement.sql))
      .join('\n');
    expect(executedSql).not.toContain('LIMIT 500');
  });

  it('degrades to lexical and structured catalog candidates when Vectorize is unavailable', async () => {
    const execute = vi.fn(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.includes('repos_fts MATCH')) return result([{ id: 7 }]);
      if (sql.includes('r.language = ? COLLATE NOCASE')) return result([]);
      if (sql.includes('json_each(?)')) {
        return result([row(7, 'oss/checkout-kit', { topics: '["payments"]' })]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const retrieve = createProjectIntelligence(
      dependencies(execute, {
        queryByRepoId: vi.fn().mockRejectedValue(new Error('Vectorize unavailable')),
      })
    );

    const response = await retrieve(project());

    expect(response.retrieval.mode).toBe('lexical-structured');
    expect(response.retrieval.semanticCandidates).toBe(0);
    expect(response.similarProjects[0].fullName).toBe('oss/checkout-kit');
  });

  it('labels a bounded catalog fallback when no project-specific lane returns candidates', async () => {
    const execute = vi.fn(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.includes('repos_fts MATCH')) return result([]);
      if (sql.includes('ORDER BY r.stargazers_count DESC')) {
        return result([row(3, 'oss/broad', { language: null })]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const retrieve = createProjectIntelligence(dependencies(execute));

    const response = await retrieve(
      project({ description: null, language: null, topics: [], fullName: 'acme/x', name: 'x' })
    );

    expect(response.retrieval).toMatchObject({ mode: 'fallback', candidateCount: 1 });
    expect(response.fallback).toBe(true);
    expect(response.recommendedTools).toEqual([]);
  });
});
