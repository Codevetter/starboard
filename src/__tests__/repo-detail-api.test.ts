import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  resolveRepoId: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: { execute: mocks.execute },
}));
vi.mock('@/app/api/repos/resolve', () => ({ resolveRepoId: mocks.resolveRepoId }));

import { GET } from '@/app/api/repos/[repoId]/route';

describe('GET /api/repos/[repoId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch or populate the cache on a catalog-only miss', async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await GET(new NextRequest('http://localhost/api/repos/123?catalogOnly=1'), {
      params: Promise.resolve({ repoId: '123' }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Repository not found in public catalog' });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('returns a cached public record without network work', async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [
        {
          id: 123,
          name: 'example',
          full_name: 'fleet/example',
          owner_login: 'fleet',
          owner_avatar: 'https://example.com/avatar.png',
          html_url: 'https://github.com/fleet/example',
          description: 'Example repository',
          language: 'TypeScript',
          stargazers_count: 9000,
          archived: 0,
          topics: '["react"]',
          repo_created_at: '2026-01-01T00:00:00Z',
          repo_updated_at: '2026-07-01T00:00:00Z',
        },
      ],
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await GET(new NextRequest('http://localhost/api/repos/123?catalogOnly=1'), {
      params: Promise.resolve({ repoId: '123' }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { repo: { full_name: string } };
    expect(payload.repo.full_name).toBe('fleet/example');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
