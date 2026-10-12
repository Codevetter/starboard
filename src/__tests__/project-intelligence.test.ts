import { beforeEach, describe, expect, it, vi } from 'vitest';
const pipeline = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/lib/knowledgebase', async (original) => ({
  ...(await original<typeof import('@/lib/knowledgebase')>()),
  knowledgePipelineEnabled: () => pipeline.enabled,
}));
beforeEach(() => {
  pipeline.enabled = false;
});

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
  it('uses reviewed capability evidence and withholds results on a review outage', async () => {
    const execute = vi.fn(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.includes('repos_fts MATCH')) return result([{ id: 2 }]);
      if (sql.includes('json_each(?)'))
        return result([
          row(2, 'oss/reminders', {
            description: 'Payments orchestration toolkit',
            topics: '["payments"]',
          }),
        ]);
      return result([]);
    });
    const reviewCandidates = vi.fn().mockResolvedValue({
      status: 'reviewed',
      matches: [
        {
          repoId: 2,
          role: 'reference',
          projectEvidence: 'Payments orchestration',
          candidateEvidence: 'Payments orchestration toolkit',
        },
      ],
    });
    const retrieve = createProjectIntelligence({ ...dependencies(execute), reviewCandidates });
    const reviewed = await retrieve(project());
    expect(reviewed.quality?.status).toBe('reviewed');
    expect(reviewed.similarProjects[0]).toMatchObject({
      id: 2,
      role: 'reference',
      evidence: [
        'Project: “Payments orchestration”',
        'Candidate: “Payments orchestration toolkit”',
      ],
    });
    expect(reviewed.recommendedTools).toEqual([]);
    reviewCandidates.mockResolvedValueOnce({ status: 'unavailable', matches: [] });
    expect(await retrieve(project())).toMatchObject({
      quality: { status: 'unavailable' },
      similarProjects: [],
      recommendedTools: [],
      fallback: true,
    });
  });
  it('embeds fresh purpose context instead of reusing a metadata-only vector', async () => {
    const execute = vi.fn().mockResolvedValue(result([]));
    const queryByRepoId = vi.fn();
    const deps = dependencies(execute, { queryByRepoId });
    await createProjectIntelligence(deps)(
      project({
        sourceContext: {
          status: 'complete',
          revision: 'a'.repeat(40),
          files: ['README.md'],
          readme: 'Track contact reminders for friends',
        },
      })
    );
    expect(queryByRepoId).not.toHaveBeenCalled();
    expect(deps.embed).toHaveBeenCalledWith([
      expect.stringContaining('Track contact reminders for friends'),
    ]);
    const statements = execute.mock.calls.map(
      ([statement]) => statement as { sql: string; args: unknown[] }
    );
    const lexical = statements.find((statement) => statement.sql.includes('repos_fts MATCH'));
    expect(lexical?.sql).not.toContain('stargazers_count >=');
    expect(lexical?.args[0]).not.toContain('typescript');
  });
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
  it('keeps retrieval and proofs tied to each feature and gates catalog membership', async () => {
    pipeline.enabled = true;
    const features = [
      {
        id: 'editor',
        description: 'Edit captions and export PNG.',
        searchQuery: 'Image caption editor',
        evidence: [{ document_id: 'project', chunk_id: 'editor', excerpt: 'Edit captions.' }],
      },
      {
        id: 'search',
        description: 'Search saved links.',
        evidence: [{ document_id: 'project', chunk_id: 'search', excerpt: 'Search saved links.' }],
      },
    ];
    const execute = vi
      .fn()
      .mockResolvedValue(result([row(2, 'oss/editor'), row(3, 'oss/bookmarks')]));
    const queryKnowledge = vi.fn(async (query: string) =>
      ['Image caption editor', 'Edit captions and export PNG.'].includes(query)
        ? [
            { repoId: 2, rankScore: 1 },
            { repoId: 99, rankScore: 0.5 },
          ]
        : [{ repoId: 3, rankScore: 1 }]
    );
    const reviewFeature = vi.fn(async (_project, _candidates, feature) => ({
      status: 'reviewed' as const,
      matches: [
        {
          repoId: feature.id === 'editor' ? 2 : 3,
          role: 'reference' as const,
          projectEvidence: feature.evidence[0].excerpt,
          candidateEvidence: 'A matching implementation.',
        },
        {
          repoId: feature.id === 'editor' ? 3 : 2,
          role: 'reference' as const,
          projectEvidence: 'Wrong feature pool',
          candidateEvidence: 'Wrong candidate',
        },
        {
          repoId: 99,
          role: 'reference' as const,
          projectEvidence: 'Not in catalog',
          candidateEvidence: 'Not in catalog',
        },
      ],
    }));
    const retrieve = createProjectIntelligence({
      ...dependencies(execute),
      projectFeatures: vi.fn().mockResolvedValue(features),
      queryKnowledge,
      reviewFeature,
    });
    const response = await retrieve(project());
    expect(queryKnowledge.mock.calls).toEqual([
      ['Edit captions and export PNG.', 50],
      ['Image caption editor', 50],
      ['Search saved links.', 50],
    ]);
    expect(
      reviewFeature.mock.calls.map((call) => call[1].map((candidate) => candidate.id))
    ).toEqual([[2], [3]]);
    expect(response.similarProjects.map((candidate) => candidate.id)).toEqual([2, 3]);
    expect(response.similarProjects[0].evidence[0]).toBe('Feature: Edit captions and export PNG.');
    expect(response.recommendedTools).toEqual([]);
    expect(response.quality).toMatchObject({
      reviewedFeatures: 2,
      totalFeatures: 2,
      unavailableFeatures: 0,
    });
    expect(execute.mock.calls[0][0]).toMatchObject({
      sql: expect.stringContaining('community_ur.is_starred = 1'),
      args: [1, '[2,3,99]', 5000],
    });
  });

  it('reports partial review coverage and refuses an unsupported integration', async () => {
    pipeline.enabled = true;
    const feature = {
      id: 'feature',
      description: 'Export captions.',
      evidence: [{ document_id: 'project', chunk_id: 'c', excerpt: 'Export captions.' }],
    };
    const execute = vi.fn().mockResolvedValue(result([row(2, 'oss/editor')]));
    const reviewFeature = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'reviewed',
        matches: [
          {
            repoId: 2,
            role: 'integration',
            projectEvidence: 'Export captions.',
            candidateEvidence: 'An editor.',
          },
        ],
      })
      .mockRejectedValueOnce(new Error('Unavailable'));
    const retrieve = createProjectIntelligence({
      ...dependencies(execute),
      projectFeatures: vi.fn().mockResolvedValue([feature, { ...feature, id: 'other' }]),
      queryKnowledge: vi.fn().mockResolvedValue([{ repoId: 2, rankScore: 1 }]),
      reviewFeature,
    });
    const response = await retrieve(project());
    expect(response.similarProjects).toEqual([]);
    expect(response.recommendedTools).toEqual([]);
    expect(response.quality).toEqual({
      status: 'reviewed',
      reviewedFeatures: 1,
      totalFeatures: 2,
      unavailableFeatures: 1,
    });
  });
  it('keeps sampled source identifiers out of the existing whole-project embedding', async () => {
    const deps = dependencies(vi.fn().mockResolvedValue(result([])));
    await createProjectIntelligence(deps)(
      project({
        sourceContext: {
          status: 'partial',
          revision: 'sha',
          readme: '',
          files: ['README.md', 'src/main.ts'],
          documents: [
            { path: 'README.md', text: 'Save and retrieve web bookmarks.' },
            { path: 'src/main.ts', text: 'INTERNAL_IMPLEMENTATION_TOKEN '.repeat(10000) },
          ],
        },
      })
    );
    const text = (deps.embed as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(text).toContain('Save and retrieve web bookmarks.');
    expect(text).not.toContain('INTERNAL_IMPLEMENTATION_TOKEN');
    expect(text.length).toBeLessThan(8000);
  });
});
