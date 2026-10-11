import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ json: vi.fn(), embed: vi.fn(), context: vi.fn() }));
vi.mock('@/lib/knowledgebase', () => ({
  catalogIndexPath: () => '/v1/indexes/catalog',
  knowledgebaseJson: mocks.json,
  knowledgebaseEmbeddings: mocks.embed,
}));
vi.mock('@/lib/project-context', () => ({ enrichProjectContext: mocks.context }));

import {
  catalogDocument,
  createKnowledgebaseRepoVectorStore,
  findKnowledgeDocument,
  ingestKnowledgeDocuments,
  queryKnowledgeCatalog,
  refreshKnowledgeRepository,
} from '@/lib/knowledge-catalog';

const row = { id: 42, full_name: 'acme/widgets', description: 'Widgets', language: 'TypeScript' };

beforeEach(() => vi.resetAllMocks());

describe('canonical Knowledgebase catalog', () => {
  it('uses canonical IDs and omits unknown revisions', () => {
    expect(catalogDocument(row)).toMatchObject({
      external_id: 'repo:42',
      metadata: { repo_id: 42, kind: 'catalog_repo', visibility: 'public' },
    });
    expect(catalogDocument(row).metadata).not.toHaveProperty('source_revision');
    expect(() => catalogDocument({ id: -1 })).toThrow('Invalid catalog');
  });

  it('rejects incomplete ingestion acknowledgements', async () => {
    mocks.json.mockResolvedValue({ documents: [] });
    await expect(ingestKnowledgeDocuments([catalogDocument(row)])).rejects.toThrow('incomplete');
    mocks.json.mockResolvedValue({ documents: [{ document_id: 'snapshot-42' }] });
    await expect(ingestKnowledgeDocuments([catalogDocument(row)])).resolves.toEqual([
      'snapshot-42',
    ]);
  });

  it('treats only a missing snapshot as absent', async () => {
    mocks.json.mockRejectedValueOnce(new Error('Knowledgebase request failed (404)'));
    await expect(findKnowledgeDocument('repo:42')).resolves.toBeNull();
    mocks.json.mockRejectedValueOnce(new Error('Knowledgebase request failed (503)'));
    await expect(findKnowledgeDocument('repo:42')).rejects.toThrow('503');
  });

  it('retains hybrid rank scores and scopes the query to public canonical sources', async () => {
    mocks.json.mockResolvedValue({
      data: [
        { score: 0.02, metadata: { repo_id: 42 } },
        { score: 0.01, metadata: { repo_id: 42 } },
        { score: 1, metadata: { repo_id: -1 } },
      ],
    });
    await expect(queryKnowledgeCatalog('widgets', 500)).resolves.toEqual([
      { repoId: 42, rankScore: 0.02 },
    ]);
    expect(mocks.json).toHaveBeenCalledWith(
      '/v1/indexes/catalog/query',
      expect.objectContaining({
        top_k: 100,
        mode: 'hybrid',
        filter: { kind: 'catalog_repo', visibility: 'public' },
      })
    );
  });

  it('uses strict vector scores for cosine distance', async () => {
    mocks.json.mockResolvedValue({ data: [{ score: 0.8, metadata: { repo_id: 42 } }] });
    const database = { execute: vi.fn() };
    const matches = await createKnowledgebaseRepoVectorStore(database).query([1], 10);
    expect(matches[0]?.distance).toBeCloseTo(0.2);
    expect(mocks.json.mock.calls[0]?.[0]).toBe('/v1/indexes/catalog/query-vector');
  });

  it('preserves a pinned source when a refresh is partial', async () => {
    mocks.json
      .mockResolvedValueOnce({ document: { id: 'current', metadata: { source_revision: 'old' } } })
      .mockResolvedValueOnce({ documents: [{ document_id: 'metadata-only' }] });
    mocks.context.mockResolvedValue({
      sourceContext: {
        status: 'partial',
        revision: 'new',
        documents: [{ path: 'README.md', text: 'partial evidence' }],
      },
    });
    await expect(refreshKnowledgeRepository(row, undefined, true)).resolves.toMatchObject({
      retainedPrevious: true,
    });
    expect(mocks.json.mock.calls[1]?.[1]).toMatchObject({
      documents: [
        {
          external_id: 'repo:42:metadata',
          metadata: { kind: 'catalog_metadata' },
        },
      ],
    });
  });

  it('publishes complete pinned sources with scalar paths', async () => {
    mocks.json
      .mockRejectedValueOnce(new Error('Knowledgebase request failed (404)'))
      .mockResolvedValueOnce({ documents: [{ document_id: 'current' }] });
    mocks.context.mockResolvedValue({
      sourceContext: {
        status: 'complete',
        revision: 'sha',
        dependencies: ['react'],
        documents: [{ path: 'PRODUCT.md', text: 'Product purpose' }],
      },
    });
    await refreshKnowledgeRepository(row, undefined, true);
    expect(mocks.json.mock.calls[1]?.[1]).toMatchObject({
      documents: [
        {
          content: expect.stringContaining('Product purpose'),
          metadata: {
            source_revision: 'sha',
            source_path: 'public-source-bundle',
            source_paths: ['PRODUCT.md'],
          },
        },
      ],
    });
  });

  it('rejects writes for IDs outside the catalog before publication', async () => {
    const database = { execute: vi.fn().mockResolvedValue({ rows: [] }) };
    await expect(
      createKnowledgebaseRepoVectorStore(database).upsert([{ repoId: 42, values: [] }])
    ).rejects.toThrow('catalog membership');
    expect(mocks.json).not.toHaveBeenCalled();
  });
});
