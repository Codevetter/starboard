import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn(), ingest: vi.fn(), json: vi.fn() }));
vi.mock('@/lib/knowledge-catalog', () => ({
  findKnowledgeDocument: mocks.find,
  ingestKnowledgeDocuments: mocks.ingest,
}));
vi.mock('@/lib/knowledgebase', () => ({
  catalogIndexPath: () => '/v1/indexes/catalog',
  knowledgebaseJson: mocks.json,
}));
import {
  catalogCapabilities,
  candidateCapabilityEvidence,
  prepareCatalogCapabilities,
} from '@/lib/knowledge-catalog-capabilities';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';

const operation = {
  input: 'HTML',
  action: 'Extract article text',
  output: 'Article text',
  method: 'Rules',
  constraints: [],
  importance: 'core' as const,
};
const evidence = {
  document_id: 'source',
  chunk_id: 'chunk',
  excerpt: 'Extract article text from HTML with rules.',
};
const source = {
  document: {
    id: 'source',
    content: evidence.excerpt,
    metadata: {
      kind: 'catalog_repo',
      visibility: 'public',
      full_name: 'acme/extractor',
      source_path: 'public-source-bundle',
      source_revision: 'a'.repeat(40),
      source_status: 'partial',
    },
  },
  chunks: [{ id: 'chunk', content: evidence.excerpt }],
};
const profile = {
  schema_version: 1,
  facts: [{ field: 'capabilities', value: evidence.excerpt, operation, evidence: [evidence] }],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockImplementation(async (id: string) => (id.endsWith(':operations') ? null : source));
  mocks.json.mockResolvedValue(profile);
});

describe('shared catalog capability cards', () => {
  it('enriches only a qualified pinned public snapshot and stores reusable exact references', async () => {
    expect(await catalogCapabilities(42, true)).toEqual([
      { value: evidence.excerpt, operation, evidence: [evidence] },
    ]);
    expect(mocks.json).toHaveBeenCalledWith(
      '/v1/indexes/catalog/enrich',
      expect.objectContaining({
        document_ids: ['source'],
        source_revision: 'a'.repeat(40),
        profile_mode: 'operations',
      })
    );
    expect(mocks.ingest.mock.calls[0][0][0]).toMatchObject({
      external_id: 'repo:42:operations',
      metadata: {
        source_document_id: 'source',
        human_validated: false,
        kind: 'catalog_capability_card',
      },
    });
  });
  it.each([
    { visibility: 'private' },
    { source_revision: 'HEAD' },
    { source_status: 'unavailable' },
    { source_path: 'github-repository-metadata' },
  ])('does not enrich unqualified evidence: %j', async (metadata) => {
    mocks.find.mockResolvedValue({
      ...source,
      document: { ...source.document, metadata: { ...source.document.metadata, ...metadata } },
    });
    expect(await catalogCapabilities(42, true)).toBeNull();
    expect(mocks.json).not.toHaveBeenCalled();
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it('reuses a card only for the same immutable source document and version', async () => {
    const cached = {
      document: {
        content: JSON.stringify(profile),
        metadata: { enricher_version: 'catalog-operations-v1', source_document_id: 'source' },
      },
    };
    mocks.find.mockImplementation(async (id: string) =>
      id.endsWith(':operations') ? cached : source
    );
    expect(await candidateCapabilityEvidence(42, operation)).toEqual([evidence]);
    expect(mocks.json).not.toHaveBeenCalled();
    cached.document.metadata.source_document_id = 'old';
    expect(await catalogCapabilities(42)).toBeNull();
    await catalogCapabilities(42, true);
    expect(mocks.json).toHaveBeenCalledOnce();
  });
  it.each([
    { ...evidence, document_id: 'other' },
    { ...evidence, chunk_id: 'unknown' },
    { ...evidence, excerpt: 'Invented quotation.' },
  ])('rejects fabricated or foreign proof', async (ref) => {
    mocks.json.mockResolvedValue({ ...profile, facts: [{ ...profile.facts[0], evidence: [ref] }] });
    await expect(catalogCapabilities(42, true)).rejects.toThrow('literal current source');
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it('deduplicates preparation, bounds the candidate count and isolates failures', async () => {
    const candidates = Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
    })) as ProjectRecommendationRepo[];
    mocks.json.mockRejectedValueOnce(new Error('Provider unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ids = await prepareCatalogCapabilities([candidates[0], ...candidates]);
    expect(ids).toEqual(Array.from({ length: 23 }, (_, index) => index + 2));
    expect(mocks.json).toHaveBeenCalledTimes(24);
    error.mockRestore();
  });
});
