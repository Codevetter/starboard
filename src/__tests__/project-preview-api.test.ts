import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolve: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock('@/lib/project-preview', () => ({ resolveProjectPreview: mocks.resolve }));
vi.mock('@/lib/project-intelligence', () => ({ retrieveProjectIntelligence: mocks.retrieve }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

import { GET } from '@/app/api/project-preview/route';

describe('public project preview API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
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

  it('does not spend anonymous GitHub quota on an uncataloged guest preview', async () => {
    mocks.resolve.mockResolvedValue({ status: 'auth-required' });

    const response = await GET(
      new NextRequest('http://localhost/api/project-preview?repository=acme%2Fnew-repo')
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ loginRequired: true });
    expect(mocks.resolve).toHaveBeenCalledWith('acme/new-repo', undefined);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it('passes the existing GitHub token to an uncataloged lookup', async () => {
    mocks.auth.mockResolvedValue({ accessToken: 'github-token' });
    mocks.resolve.mockResolvedValue({ status: 'unavailable' });

    await GET(new NextRequest('http://localhost/api/project-preview?repository=acme%2Fmissing'));

    expect(mocks.resolve).toHaveBeenCalledWith('acme/missing', 'github-token');
  });
});
