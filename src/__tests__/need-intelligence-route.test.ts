import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  execute: vi.fn(),
  batch: vi.fn(),
  json: vi.fn(),
  ingest: vi.fn(),
  find: vi.fn(),
  query: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock('@/db', () => ({ db: { execute: mocks.execute, batch: mocks.batch } }));
vi.mock('@/lib/project-route-helpers', () => ({ loadOwnedProject: mocks.load }));
vi.mock('@/lib/knowledgebase', () => ({
  knowledgePipelineEnabled: mocks.enabled,
  catalogIndexPath: () => '/catalog',
  knowledgebaseJson: mocks.json,
}));
vi.mock('@/lib/knowledge-catalog', () => ({
  ingestKnowledgeDocuments: mocks.ingest,
  findKnowledgeDocument: mocks.find,
  queryKnowledgeCatalog: mocks.query,
}));
vi.mock('@/lib/knowledge-decisions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/knowledge-decisions')>()),
  reviewKnowledgeProject: async () => ({ status: 'reviewed', matches: [] }),
}));
import { GET } from '@/app/api/projects/[slug]/intelligence/route';
const quote = '- [ ] Add offline payment reconciliation.';
const project = {
  id: 1,
  name: 'app',
  fullName: 'acme/app',
  htmlUrl: 'https://github.com/acme/app',
  description: 'Payment app',
  language: 'Swift',
  stargazersCount: 1,
  archived: false,
  topics: ['ai'],
  tools: [],
  sourceContext: {
    status: 'complete',
    revision: 'sha',
    readme: '',
    files: ['PRODUCT.md'],
    documents: [{ path: 'PRODUCT.md', text: 'Payment app', requirementText: quote }],
  },
};
const request = () => new NextRequest('https://starboard.test/api/projects/1/intelligence?run=1');
const params = { params: Promise.resolve({ slug: '1' }) };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockResolvedValue({ repoId: 1, project });
  mocks.execute.mockResolvedValue({ rows: [], columns: [], rowsAffected: 0 });
  mocks.batch.mockResolvedValue([]);
  mocks.enabled.mockReturnValue(true);
  mocks.find.mockResolvedValue(null);
  mocks.ingest.mockResolvedValue(['source']);
  mocks.query.mockResolvedValue([]);
  mocks.json.mockResolvedValue({
    schema_version: 1,
    needs: [
      {
        title: 'Offline reconciliation',
        desired_outcome: 'Reconcile offline payments',
        constraints: [],
        evidence: [{ document_id: 'source', chunk_id: 'chunk', excerpt: quote }],
      },
    ],
  });
});
describe('need intelligence API', () => {
  it('runs Knowledgebase enrichment on inspected requirements and persists the explicit need', async () => {
    const response = await GET(request(), params);
    const result = await response.json();
    expect(result.draft.needs[0].need).toMatchObject({
      title: 'Offline reconciliation',
      currentState: quote,
    });
    expect(mocks.load.mock.calls).toEqual([['1'], ['1', true]]);
    expect(mocks.json).toHaveBeenCalledOnce();
    expect(mocks.ingest.mock.calls[0][0][0].content).toBe(quote);
  });
  it.each([true, false])(
    'reads a cached draft without GitHub enrichment (knowledge mode %s)',
    async (enabled) => {
      mocks.enabled.mockReturnValue(enabled);
      const draft = {
        retrievalVersion: enabled ? 'knowledgebase-explicit-needs-v2' : 'explicit-needs-v2',
        needs: [],
      };
      mocks.execute.mockImplementation(async ({ sql }: { sql: string }) => ({
        rows: sql.includes('project_draft_reports') ? [{ report: JSON.stringify(draft) }] : [],
      }));
      const response = await GET(request(), params);
      expect((await response.json()).draft).toEqual(draft);
      expect(mocks.load.mock.calls).toEqual([['1']]);
      expect(mocks.json).not.toHaveBeenCalled();
    }
  );
});

it.each([
  { status: 'unavailable', inspectionFailed: false },
  { status: 'partial', inspectionFailed: true },
])('returns retryable JSON without overwriting state on source failure: %j', async (context) => {
  mocks.load.mockResolvedValue({
    repoId: 1,
    project: { ...project, sourceContext: { ...project.sourceContext, ...context } },
  });
  const response = await GET(request(), params);
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain('unavailable');
  expect(mocks.execute.mock.calls.every(([statement]) => statement.sql.startsWith('SELECT'))).toBe(
    true
  );
  expect(mocks.batch).not.toHaveBeenCalled();
});
