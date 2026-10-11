import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ json: vi.fn(), ingest: vi.fn(), find: vi.fn() }));
vi.mock('@/lib/knowledgebase', () => ({
  catalogIndexPath: () => '/v1/indexes/catalog',
  knowledgebaseJson: mocks.json,
}));
vi.mock('@/lib/knowledge-catalog', () => ({
  ingestKnowledgeDocuments: mocks.ingest,
  findKnowledgeDocument: mocks.find,
}));

import {
  compareKnowledgeDecisions,
  projectKnowledgeDocuments,
  reviewKnowledgeProject,
} from '@/lib/knowledge-decisions';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';

const project: ProjectRecommendationRepo = {
  id: 1,
  name: 'widgets',
  fullName: 'acme/widgets',
  htmlUrl: 'https://github.com/acme/widgets',
  description: 'Widget framework',
  language: 'TypeScript',
  stargazersCount: 1,
  archived: false,
  topics: [],
  tools: [],
  sourceContext: {
    status: 'complete',
    readme: null,
    revision: 'a'.repeat(40),
    files: ['PRODUCT.md'],
    documents: [
      {
        path: 'PRODUCT.md',
        text: 'Widget rendering. We need to add accessible keyboard controls.',
      },
    ],
  },
};
const candidate = { ...project, id: 42 };
const evidence = {
  document_id: 'context',
  chunk_id: 'chunk',
  excerpt: 'We need to add accessible keyboard controls.',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ingest.mockResolvedValue(['context']);
  mocks.find.mockResolvedValue({ document: { id: 'candidate' } });
  mocks.json.mockImplementation(async (path: string) => {
    if (path === '/v1/documents/context')
      return {
        document: { id: 'context' },
        chunks: [{ id: 'chunk', content: evidence.excerpt }],
      };
    return {
      status: 'ok',
      result: {
        abstained: false,
        items: [
          {
            candidate_id: '42',
            verdict: 'reference',
            project_evidence: [evidence],
            candidate_evidence: [evidence],
          },
        ],
      },
    };
  });
});

describe('source-grounded recommendation decisions', () => {
  it('uses stable bounded IDs and isolates folder scopes', async () => {
    const longPath = `${'a/'.repeat(150)}PRODUCT.md`;
    const scoped = {
      ...project,
      sourceContext: {
        ...project.sourceContext!,
        scope: 'apps/widgets',
        documents: [{ path: longPath, text: 'Purpose' }],
      },
    };
    const [first] = await projectKnowledgeDocuments(scoped);
    const [again] = await projectKnowledgeDocuments(scoped);
    const [other] = await projectKnowledgeDocuments({
      ...scoped,
      sourceContext: { ...scoped.sourceContext, scope: 'apps/other' },
    });
    expect(first?.external_id.length).toBeLessThan(256);
    expect(first?.external_id).toBe(again?.external_id);
    expect(first?.external_id).not.toBe(other?.external_id);
    expect(first?.metadata.source_path).toBe(longPath);
  });

  it('calls the current decision engine with catalog candidates and explicit gaps', async () => {
    await expect(reviewKnowledgeProject(project, [candidate])).resolves.toMatchObject({
      status: 'reviewed',
      matches: [{ repoId: 42, role: 'reference' }],
    });
    expect(mocks.json).toHaveBeenLastCalledWith(
      '/v1/indexes/catalog/decide',
      expect.objectContaining({
        engine: 'free_ai',
        context_document_ids: ['context'],
        candidates: [{ id: '42', document_ids: ['candidate'] }],
        explicit_gaps: [evidence],
      })
    );
  });

  it('compares both engines through one frozen-input endpoint', async () => {
    await compareKnowledgeDecisions(project, [candidate]);
    expect(mocks.json).toHaveBeenLastCalledWith(
      '/v1/indexes/catalog/compare',
      expect.objectContaining({
        context_document_ids: ['context'],
        candidates: [{ id: '42', document_ids: ['candidate'] }],
      })
    );
    expect(mocks.json.mock.calls.at(-1)?.[1]).not.toHaveProperty('engine');
  });

  it('rejects invented candidate IDs and missing quoted evidence', async () => {
    mocks.json
      .mockResolvedValueOnce({ document: { id: 'context' }, chunks: [] })
      .mockResolvedValueOnce({
        status: 'ok',
        result: {
          items: [
            {
              candidate_id: '999',
              verdict: 'reference',
              project_evidence: [evidence],
              candidate_evidence: [evidence],
            },
            {
              candidate_id: '42',
              verdict: 'integration',
              project_evidence: [],
              candidate_evidence: [evidence],
            },
          ],
        },
      });
    await expect(reviewKnowledgeProject(project, [candidate])).resolves.toEqual({
      status: 'reviewed',
      matches: [],
    });
  });

  it('reports missing source snapshots without substituting legacy results', async () => {
    mocks.find.mockResolvedValue(null);
    await expect(reviewKnowledgeProject(project, [candidate])).resolves.toEqual({
      status: 'unavailable',
      matches: [],
      reason: 'provider-error',
    });
    expect(mocks.json).not.toHaveBeenCalledWith('/v1/indexes/catalog/decide', expect.anything());
  });

  it('keeps disabled providers unavailable and does not infer project needs without sources', async () => {
    mocks.json
      .mockResolvedValueOnce({ document: { id: 'context' }, chunks: [] })
      .mockResolvedValueOnce({ status: 'disabled' });
    expect((await reviewKnowledgeProject(project, [candidate])).status).toBe('unavailable');
    mocks.ingest.mockClear();
    expect(
      (await reviewKnowledgeProject({ ...project, sourceContext: undefined }, [candidate])).status
    ).toBe('unavailable');
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
});
