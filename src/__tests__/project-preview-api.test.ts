import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock('@/lib/project-preview', () => ({ resolveProjectPreview: mocks.resolve }));
vi.mock('@/lib/project-intelligence', () => ({ retrieveProjectIntelligence: mocks.retrieve }));

import { GET } from '@/app/api/project-preview/route';

describe('public project preview API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.retrieve.mockResolvedValue({
      similarProjects: [],
      recommendedTools: [],
      fallback: false,
      context: { language: 'TypeScript', topics: [], tools: [] },
      retrieval: {
        mode: 'hybrid',
        candidateCount: 10,
        semanticCandidates: 5,
        lexicalCandidates: 5,
        structuredCandidates: 5,
      },
    });
  });

  it('returns a format error without recommendation work', async () => {
    mocks.resolve.mockResolvedValue({ status: 'invalid' });

    const response = await GET(
      new NextRequest('http://localhost/api/project-preview?repository=invalid')
    );

    expect(response.status).toBe(400);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it('returns a non-persistent recommendation preview with public caching', async () => {
    const project = { id: 1, fullName: 'acme/app' };
    mocks.resolve.mockResolvedValue({ status: 'resolved', source: 'catalog', project });

    const response = await GET(
      new NextRequest('http://localhost/api/project-preview?repository=acme%2Fapp')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=1800');
    expect(payload).toMatchObject({ project, source: 'catalog', retrieval: { mode: 'hybrid' } });
    expect(mocks.retrieve).toHaveBeenCalledWith(project, 12);
  });
});
