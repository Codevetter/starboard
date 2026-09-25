import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  resolveRepoId: vi.fn(),
  refreshRepoFromGitHub: vi.fn(),
  repoMetadataIsStale: vi.fn(),
  auth: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: { execute: mocks.execute },
}));
vi.mock('@/app/api/repos/resolve', () => ({
  resolveRepoId: mocks.resolveRepoId,
  refreshRepoFromGitHub: mocks.refreshRepoFromGitHub,
  repoMetadataIsStale: mocks.repoMetadataIsStale,
  upsertRepoFromGitHub: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));

import { GET } from '@/app/api/repos/[repoId]/route';

const cachedRow = (overrides: Record<string, unknown> = {}) => ({
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
  fetched_at: '2026-07-01 00:00:00',
  ...overrides,
});

describe('GET /api/repos/[repoId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.repoMetadataIsStale.mockReturnValue(false);
    mocks.refreshRepoFromGitHub.mockResolvedValue(false);
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
    mocks.execute.mockResolvedValueOnce({ rows: [cachedRow()] });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await GET(new NextRequest('http://localhost/api/repos/123?catalogOnly=1'), {
      params: Promise.resolve({ repoId: '123' }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { repo: { full_name: string } };
    expect(payload.repo.full_name).toBe('fleet/example');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.repoMetadataIsStale).not.toHaveBeenCalled();
    expect(mocks.refreshRepoFromGitHub).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('refreshes a stale cached record from GitHub and serves the fresh row', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [cachedRow()] })
      .mockResolvedValueOnce({ rows: [cachedRow({ stargazers_count: 42_000 })] });
    mocks.repoMetadataIsStale.mockReturnValue(true);
    mocks.refreshRepoFromGitHub.mockResolvedValue(true);

    const response = await GET(new NextRequest('http://localhost/api/repos/123'), {
      params: Promise.resolve({ repoId: '123' }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { repo: { stargazers_count: number } };
    expect(payload.repo.stargazers_count).toBe(42_000);
    expect(mocks.repoMetadataIsStale).toHaveBeenCalledWith('2026-07-01 00:00:00');
    expect(mocks.refreshRepoFromGitHub).toHaveBeenCalledWith('fleet/example', null);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('serves the stored row when a refresh attempt fails', async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [cachedRow()] });
    mocks.repoMetadataIsStale.mockReturnValue(true);
    mocks.refreshRepoFromGitHub.mockRejectedValue(new Error('GitHub down'));

    const response = await GET(new NextRequest('http://localhost/api/repos/123'), {
      params: Promise.resolve({ repoId: '123' }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { repo: { stargazers_count: number } };
    expect(payload.repo.stargazers_count).toBe(9000);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
});
