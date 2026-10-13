import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  load: vi.fn(),
  candidates: vi.fn(),
  compare: vi.fn(),
}));
vi.mock('@/lib/knowledgebase', () => ({ knowledgePipelineEnabled: mocks.enabled }));
vi.mock('@/lib/project-route-helpers', () => ({ loadOwnedProject: mocks.load }));
vi.mock('@/lib/project-intelligence', () => ({ knowledgeProjectCandidates: mocks.candidates }));
vi.mock('@/lib/knowledge-decisions', () => ({ compareKnowledgeDecisions: mocks.compare }));

import { POST } from '@/app/api/projects/[slug]/compare/route';

const project = { id: 1, fullName: 'acme/app' };
const candidate = {
  id: 42,
  fullName: 'acme/reference',
  htmlUrl: 'https://github.com/acme/reference',
};
const request = () => new NextRequest('http://localhost/api/projects/1/compare?path=apps%2Fweb');
const invoke = () => POST(request(), { params: Promise.resolve({ slug: '1' }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.load.mockResolvedValue({ project });
  mocks.candidates.mockResolvedValue([candidate]);
  mocks.compare.mockResolvedValue({
    comparison_id: 'comparison',
    input_hash: 'identical-evidence',
    engines: {
      free_ai: { status: 'ok', resolved_model: 'fixture-model', raw: { private: 'provider data' } },
      jev: { status: 'disabled', resolved_model: null, raw: null },
    },
    coverage: { candidates: 1, omitted_candidates: 0 },
  });
});

describe('project model comparison API', () => {
  it('does no decision work before the complete pipeline cutover', async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await invoke()).status).toBe(503);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it('requires ownership before retrieving candidates or comparing models', async () => {
    mocks.load.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    expect((await invoke()).status).toBe(403);
    expect(mocks.load).toHaveBeenCalledWith('1', true, 'apps/web');
    expect(mocks.candidates).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it('passes one catalog candidate set to comparison and preserves disabled Jev without raw data', async () => {
    const response = await invoke();
    const body = (await response.json()) as {
      input_hash: string;
      engines: Record<string, Record<string, unknown>>;
      candidates: Array<{ id: string; fullName: string; htmlUrl: string }>;
    };
    expect(response.status).toBe(200);
    expect(mocks.compare).toHaveBeenCalledExactlyOnceWith(project, [candidate]);
    expect(body.input_hash).toBe('identical-evidence');
    expect(body.engines.jev.status).toBe('disabled');
    expect(body.engines.free_ai.resolved_model).toBe('fixture-model');
    expect(body.engines.free_ai).not.toHaveProperty('raw');
    expect(body.engines.jev).not.toHaveProperty('raw');
    expect(body.candidates).toEqual([{ ...candidate, id: '42' }]);
  });

  it('bounds the catalog candidate set to twenty', async () => {
    const candidates = Array.from({ length: 30 }, (_, index) => ({ ...candidate, id: index + 1 }));
    mocks.candidates.mockResolvedValue(candidates);
    expect((await invoke()).status).toBe(200);
    expect(mocks.compare).toHaveBeenCalledWith(project, candidates.slice(0, 20));
  });

  it('withholds comparison when candidate retrieval is unavailable', async () => {
    mocks.candidates.mockRejectedValue(new Error('source service unavailable'));
    const response = await invoke();
    expect(response.status).toBe(503);
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      error:
        'Comparison could not complete. Source coverage or the decision service is unavailable.',
    });
  });

  it('withholds comparison when snapshots or the decision service are unavailable', async () => {
    mocks.compare.mockRejectedValue(new Error('stale source or provider failure'));
    const response = await invoke();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error:
        'Comparison could not complete. Source coverage or the decision service is unavailable.',
    });
  });
});
