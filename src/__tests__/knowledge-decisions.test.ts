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
const candidateEvidence = { ...evidence, document_id: 'candidate', chunk_id: 'candidate-chunk' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ingest.mockResolvedValue(['context']);
  mocks.find.mockResolvedValue({
    document: { id: 'candidate' },
    chunks: [{ id: 'candidate-chunk', content: candidateEvidence.excerpt }],
  });
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
            candidate_evidence: [candidateEvidence],
          },
        ],
      },
    };
  });
});

describe('source-grounded recommendation decisions', () => {
  it('retains all bounded product documents including later feature inventories', async () => {
    const documents = [
      'PRODUCT.md',
      'PROJECT_STATUS.md',
      'README.md',
      'docs/product/features.md',
      'docs/product/overview.md',
    ].map((path) => ({ path, text: `Evidence for ${path}` }));
    const result = await projectKnowledgeDocuments({
      ...project,
      sourceContext: { ...project.sourceContext!, documents },
    });
    expect(result).toHaveLength(5);
    expect(result.map((document) => document.metadata.source_path)).toEqual(
      documents.map((document) => document.path)
    );
    expect(
      result.every((document) => document.metadata.extractor_version === 'starboard-project-v2')
    ).toBe(true);
  });

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
              candidate_evidence: [candidateEvidence],
            },
            {
              candidate_id: '42',
              verdict: 'integration',
              project_evidence: [],
              candidate_evidence: [candidateEvidence],
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
  it('refuses old combined judgments for an operation review', async () => {
    const feature = {
      id: 'feature',
      description: 'Render widgets.',
      operation: {
        input: 'Widget definitions',
        action: 'Render widgets',
        output: 'Interactive widgets',
        method: '',
        constraints: [],
        importance: 'core' as const,
      },
      evidence: [evidence],
    };
    expect(await reviewKnowledgeProject(project, [candidate], undefined, feature)).toEqual({
      status: 'unavailable',
      matches: [],
      reason: 'invalid-response',
    });
    expect(mocks.json).toHaveBeenCalledWith(
      '/v1/indexes/catalog/decide',
      expect.objectContaining({ feature_operation: feature.operation })
    );
  });

  it('only surfaces useful references for an implemented feature', async () => {
    const feature = {
      id: 'feature',
      description: 'Render widgets.',
      operation: {
        input: 'Widget definitions',
        action: 'Render widgets',
        output: 'Interactive widgets',
        method: '',
        constraints: [],
        importance: 'core' as const,
      },
      evidence: [evidence],
    };
    const candidates = [42, 43, 44, 45].map((id) => ({ ...candidate, id }));
    mocks.json.mockImplementation(async (path: string) => {
      if (path === '/v1/documents/context')
        return {
          document: { id: 'context' },
          chunks: [{ id: 'chunk', content: evidence.excerpt }],
        };
      return {
        status: 'ok',
        result: {
          items: candidates.map((repo, index) => ({
            candidate_id: String(repo.id),
            verdict: index === 3 ? 'integration' : 'reference',
            utility: ['high', 'medium', 'low', 'high'][index],
            comparison: { action: 'Compare widget rendering.', differences: 'Different layouts.' },
            project_evidence: [evidence],
            candidate_evidence: [candidateEvidence],
          })),
        },
      };
    });

    const result = await reviewKnowledgeProject(project, candidates, undefined, feature);
    expect(result.status).toBe('reviewed');
    expect(result.matches.map((match) => [match.repoId, match.utility])).toEqual([
      [42, 'high'],
      [43, 'medium'],
    ]);
  });

  it.each([
    { ...candidateEvidence, document_id: 'context', chunk_id: 'chunk' },
    { ...candidateEvidence, chunk_id: 'unknown' },
    { ...candidateEvidence, excerpt: 'An invented candidate capability.' },
  ])('withholds a recommendation with foreign or invented candidate proof: %j', async (ref) => {
    mocks.json
      .mockResolvedValueOnce({
        document: { id: 'context' },
        chunks: [{ id: 'chunk', content: evidence.excerpt }],
      })
      .mockResolvedValueOnce({
        status: 'ok',
        result: {
          items: [
            {
              candidate_id: '42',
              verdict: 'reference',
              project_evidence: [evidence],
              candidate_evidence: [ref],
            },
          ],
        },
      });
    expect(await reviewKnowledgeProject(project, [candidate])).toEqual({
      status: 'reviewed',
      matches: [],
    });
  });

  it('rejects the retained JSON serialization-as-deserialization false positive despite high utility', async () => {
    const projectQuote = 'Deserialize a JSON configuration file into an in-memory data structure.';
    // typicode/lowdb README, retained immutable source 8a6fce9b72f769b22533f0979fbc2e73180f8112.
    const candidateQuote =
      'This is because whenever you call `db.write`, the whole `db.data` is serialized using `JSON.stringify` and written to storage.';
    mocks.find.mockResolvedValue({
      document: { id: 'candidate' },
      chunks: [{ id: 'candidate-chunk', content: candidateQuote }],
    });
    mocks.json
      .mockResolvedValueOnce({
        document: { id: 'context' },
        chunks: [{ id: 'chunk', content: projectQuote }],
      })
      .mockResolvedValueOnce({
        status: 'ok',
        result: {
          items: [
            {
              candidate_id: '42',
              verdict: 'reference',
              utility: 'high',
              comparison: {
                action: 'Compare JSON deserialization.',
                differences: 'Different languages.',
              },
              project_evidence: [{ ...evidence, excerpt: projectQuote }],
              candidate_evidence: [{ ...candidateEvidence, excerpt: candidateQuote }],
            },
          ],
        },
      });
    const result = await reviewKnowledgeProject(project, [candidate], undefined, {
      id: 'json',
      description: projectQuote,
      evidence: [{ ...evidence, excerpt: projectQuote }],
      operation: {
        input: 'JSON file',
        action: 'Deserialize JSON',
        output: 'In-memory object',
        method: '',
        constraints: [],
        importance: 'core',
      },
    });
    expect(result).toEqual({ status: 'reviewed', matches: [] });
  });
});
