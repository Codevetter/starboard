import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  resolveRepo: vi.fn(),
  refreshRepoFromGitHub: vi.fn(),
  repoMetadataIsStale: vi.fn(),
  upsertRepoFromGitHub: vi.fn(),
  getCloudflareContext: vi.fn(),
  auth: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: { execute: mocks.execute },
}));
vi.mock('@/app/api/repos/resolve', () => ({
  resolveRepo: mocks.resolveRepo,
  refreshRepoFromGitHub: mocks.refreshRepoFromGitHub,
  repoMetadataIsStale: mocks.repoMetadataIsStale,
  upsertRepoFromGitHub: mocks.upsertRepoFromGitHub,
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: mocks.getCloudflareContext }));

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
    mocks.getCloudflareContext.mockImplementation(() => {
      throw new Error('No Cloudflare request context');
    });
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

  it('returns a cached slug lookup row without a second D1 read', async () => {
    mocks.resolveRepo.mockResolvedValue({
      id: 123,
      cachedResult: { rows: [cachedRow()] },
    });

    const response = await GET(
      new NextRequest('http://localhost/api/repos/lookup?name=fleet/example'),
      {
        params: Promise.resolve({ repoId: 'lookup' }),
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      repo: {
        id: 123,
        name: 'example',
        full_name: 'fleet/example',
        owner_login: 'fleet',
        owner_avatar: 'https://example.com/avatar.png',
        html_url: 'https://github.com/fleet/example',
        description: 'Example repository',
        language: 'TypeScript',
        stargazers_count: 9000,
        archived: false,
        topics: ['react'],
        repo_created_at: '2026-01-01T00:00:00Z',
        repo_updated_at: '2026-07-01T00:00:00Z',
      },
    });
    expect(mocks.resolveRepo).toHaveBeenCalledWith('fleet', 'example');
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('refreshes a stale cached slug with auth and hydrates the updated row by ID', async () => {
    mocks.resolveRepo.mockResolvedValue({
      id: 123,
      cachedResult: { rows: [cachedRow()] },
    });
    mocks.repoMetadataIsStale.mockReturnValue(true);
    mocks.auth.mockResolvedValue({ accessToken: 'session-token' });
    mocks.refreshRepoFromGitHub.mockResolvedValue(true);
    mocks.execute.mockResolvedValueOnce({
      rows: [cachedRow({ stargazers_count: 42_000 })],
    });

    const response = await GET(
      new NextRequest('http://localhost/api/repos/lookup?name=fleet/example'),
      {
        params: Promise.resolve({ repoId: 'lookup' }),
      }
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { repo: { stargazers_count: number } };
    expect(payload.repo.stargazers_count).toBe(42_000);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(mocks.refreshRepoFromGitHub).toHaveBeenCalledWith('fleet/example', 'session-token');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith({
      sql: 'SELECT * FROM repos WHERE id = ?',
      args: [123],
    });
  });

  it('preserves a missing slug lookup 404', async () => {
    mocks.resolveRepo.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/api/repos/lookup?name=fleet/missing'),
      {
        params: Promise.resolve({ repoId: 'lookup' }),
      }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Repository not found' });
    expect(mocks.execute).not.toHaveBeenCalled();
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

  it('serves stale details immediately and completes one deferred refresh', async () => {
    let completeRefresh!: (value: boolean) => void;
    let persisted = false;
    const refreshResult = new Promise<boolean>((resolve) => {
      completeRefresh = resolve;
    });
    const waitUntilPromises: Promise<unknown>[] = [];
    const ctx = {
      receiver: 'worker-execution-context',
      waitUntil(this: { receiver: string }, promise: Promise<unknown>) {
        expect(this.receiver).toBe('worker-execution-context');
        waitUntilPromises.push(promise);
      },
    };
    mocks.getCloudflareContext.mockReturnValue({
      ctx,
    });
    mocks.execute.mockResolvedValueOnce({ rows: [cachedRow()] });
    mocks.repoMetadataIsStale.mockReturnValue(true);
    mocks.refreshRepoFromGitHub.mockImplementation(async () => {
      const refreshed = await refreshResult;
      persisted = refreshed;
      return refreshed;
    });

    const response = await GET(new NextRequest('http://localhost/api/repos/123'), {
      params: Promise.resolve({ repoId: '123' }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).repo.stargazers_count).toBe(9000);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(mocks.refreshRepoFromGitHub).toHaveBeenCalledTimes(1);
    expect(waitUntilPromises).toHaveLength(1);
    expect(persisted).toBe(false);

    completeRefresh(true);
    await waitUntilPromises[0];
    expect(persisted).toBe(true);
  });

  it('still fetches a missing numeric repository from GitHub', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [cachedRow()] });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 123,
          name: 'example',
          full_name: 'fleet/example',
          owner: { login: 'fleet', avatar_url: 'https://example.com/avatar.png' },
          html_url: 'https://github.com/fleet/example',
          description: 'Example repository',
          language: 'TypeScript',
          stargazers_count: 9000,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-07-01T00:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const response = await GET(new NextRequest('http://localhost/api/repos/123'), {
      params: Promise.resolve({ repoId: '123' }),
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.github.com/repositories/123',
      expect.objectContaining({ next: { revalidate: 3600 } })
    );
    expect(mocks.upsertRepoFromGitHub).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
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
