import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  json: vi.fn(),
  ingest: vi.fn(),
  find: vi.fn(),
  documents: vi.fn(),
}));
vi.mock('@/lib/knowledgebase', () => ({
  catalogIndexPath: () => '/v1/indexes/catalog',
  knowledgebaseJson: mocks.json,
}));
vi.mock('@/lib/knowledge-catalog', () => ({
  ingestKnowledgeDocuments: mocks.ingest,
  findKnowledgeDocument: mocks.find,
}));
vi.mock('@/lib/knowledge-decisions', () => ({ projectKnowledgeDocuments: mocks.documents }));
import { knowledgeProjectFeatures } from '@/lib/knowledge-project-profile';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';
const project: ProjectRecommendationRepo = {
  id: 1,
  name: 'tool',
  fullName: 'acme/tool',
  htmlUrl: 'https://github.com/acme/tool',
  description: null,
  language: null,
  stargazersCount: 1,
  archived: false,
  topics: [],
  tools: [],
  sourceContext: {
    status: 'complete',
    revision: 'sha',
    readme: '',
    files: ['apps/tool/src/editor.ts'],
    scope: 'apps/tool',
  },
};
const fact = {
  field: 'capabilities',
  value: 'Edit captions and export images.',
  evidence: [
    { document_id: 'source', chunk_id: 'chunk', excerpt: 'Edit captions and export images.' },
  ],
};
const profile = {
  schema_version: 1,
  facts: [fact],
  profile: { purpose: 'An editor.', capabilities: [fact.value] },
  needs: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.documents.mockResolvedValue([{ external_id: 'source', content: fact.value, metadata: {} }]);
  mocks.ingest.mockResolvedValue(['source']);
  mocks.find.mockResolvedValue(null);
  mocks.json.mockResolvedValue(profile);
});
describe('implemented project feature extraction', () => {
  it('requests implemented features for the connected scope and stores exact source references', async () => {
    const features = await knowledgeProjectFeatures(project);
    expect(features).toEqual([
      { id: expect.any(String), description: fact.value, evidence: fact.evidence },
    ]);
    expect(mocks.json).toHaveBeenCalledWith('/v1/indexes/catalog/enrich', {
      document_ids: ['source'],
      subject_id: 'acme/tool',
      source_revision: 'sha',
      subject_scope: 'apps/tool',
      profile_mode: 'capabilities',
    });
    expect(mocks.ingest.mock.calls[1][0][0]).toMatchObject({
      external_id: 'project:1:apps/tool:features',
      metadata: {
        kind: 'project_features',
        human_validated: false,
        source_document_ids: ['source'],
      },
    });
  });
  it('reuses a current profile only when the extraction version and all source IDs agree', async () => {
    mocks.find.mockResolvedValue({
      document: {
        content: JSON.stringify(profile),
        metadata: {
          enricher_version: 'knowledgebase-features-v4',
          source_document_ids: ['source'],
        },
      },
    });
    expect(await knowledgeProjectFeatures(project)).toHaveLength(1);
    expect(mocks.json).not.toHaveBeenCalled();
    expect(mocks.ingest).toHaveBeenCalledTimes(1);
  });
  it.each([
    { enricher_version: 'old', source_document_ids: ['source'] },
    { enricher_version: 'knowledgebase-features-v4', source_document_ids: ['old-source'] },
  ])('refreshes stale profile metadata: %j', async (metadata) => {
    mocks.find.mockResolvedValue({ document: { content: 'stale', metadata } });
    await knowledgeProjectFeatures(project);
    expect(mocks.json).toHaveBeenCalledOnce();
  });
  it.each([
    { ...fact, evidence: [{ ...fact.evidence[0], document_id: 'other-project' }] },
    { ...fact, evidence: [] },
    { ...fact, value: '' },
  ])('rejects unsupported feature facts: %j', async (invalid) => {
    mocks.json.mockResolvedValue({ ...profile, facts: [invalid] });
    await expect(knowledgeProjectFeatures(project)).rejects.toThrow(
      'Invalid source-grounded feature'
    );
    expect(mocks.ingest).toHaveBeenCalledTimes(1);
  });
  it('does not infer a gap or accept an empty implementation profile', async () => {
    mocks.json.mockResolvedValue({ ...profile, facts: [{ ...fact, field: 'avoid_when' }] });
    await expect(knowledgeProjectFeatures(project)).rejects.toThrow('implementation coverage');
  });
  it('does not call the model when source coverage is unavailable', async () => {
    mocks.documents.mockResolvedValue([]);
    await expect(knowledgeProjectFeatures(project)).rejects.toThrow('source coverage');
    expect(mocks.json).not.toHaveBeenCalled();
  });
  it('uses a bounded Knowledgebase search abstraction while preserving the feature claim', async () => {
    mocks.json.mockResolvedValue({
      ...profile,
      facts: [{ ...fact, search_query: 'Image caption editor' }],
    });
    expect(await knowledgeProjectFeatures(project)).toEqual([
      {
        id: expect.any(String),
        description: fact.value,
        searchQuery: 'Image caption editor',
        evidence: fact.evidence,
      },
    ]);
  });
  it('rejects unbounded search abstractions', async () => {
    mocks.json.mockResolvedValue({
      ...profile,
      facts: [{ ...fact, search_query: 'x'.repeat(65) }],
    });
    await expect(knowledgeProjectFeatures(project)).rejects.toThrow(
      'Invalid source-grounded feature'
    );
  });
  it('retains the primary-purpose query alongside independent feature queries', async () => {
    mocks.json.mockResolvedValue({
      ...profile,
      facts: [
        {
          ...fact,
          field: 'purpose',
          value: 'A caption editor.',
          search_query: 'Meme caption editor',
        },
        fact,
      ],
    });
    const features = await knowledgeProjectFeatures(project);
    expect(features.map((feature) => feature.description)).toEqual([
      'A caption editor.',
      fact.value,
    ]);
    expect(features[0].searchQuery).toBe('Meme caption editor');
  });
});
