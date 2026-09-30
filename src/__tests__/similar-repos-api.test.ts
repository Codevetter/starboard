import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  execute: vi.fn(),
  queryByRepoId: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/db', () => ({ db: { execute: mocks.execute } }));
vi.mock('@/lib/repo-vectors', () => ({
  repoVectors: () => ({ queryByRepoId: mocks.queryByRepoId }),
}));

import { GET } from '@/app/api/repos/[repoId]/similar/route';

describe('GET /api/repos/[repoId]/similar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.queryByRepoId.mockResolvedValue([{ repoId: 2, distance: 0.2 }]);
    mocks.execute
      .mockResolvedValueOnce({
        rows: [
          {
            name: 'app',
            full_name: 'acme/app',
            description: 'A TypeScript commerce application',
            language: 'TypeScript',
            topics: '["commerce","nextjs"]',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            name: 'store',
            full_name: 'peer/store',
            owner_login: 'peer',
            owner_avatar: 'https://example.com/peer.png',
            html_url: 'https://github.com/peer/store',
            description: 'A TypeScript commerce platform',
            language: 'TypeScript',
            stargazers_count: 12_000,
            archived: 0,
            topics: '["commerce"]',
            repo_updated_at: '2026-08-01T00:00:00Z',
          },
        ],
      });
  });

  it('serves global similarity to a guest', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/repos/1/similar?scope=global'),
      { params: Promise.resolve({ repoId: '1' }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      similar: [{ id: 2, full_name: 'peer/store', similarity: 0.8 }],
    });
    expect(mocks.queryByRepoId).toHaveBeenCalledWith(1, 100);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('fails closed when session lookup fails for explicit user scope', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('Auth unavailable'));

    const response = await GET(new NextRequest('http://localhost/api/repos/1/similar?scope=user'), {
      params: Promise.resolve({ repoId: '1' }),
    });

    expect(response.status).toBe(401);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.queryByRepoId).not.toHaveBeenCalled();
  });

  it('preserves authenticated user-scope hydration', async () => {
    mocks.auth.mockResolvedValueOnce({ user: { githubId: 'owner-1' } });

    const response = await GET(new NextRequest('http://localhost/api/repos/1/similar?scope=user'), {
      params: Promise.resolve({ repoId: '1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sql: expect.stringContaining('FROM user_repos ur'),
        args: ['owner-1', 2],
      })
    );
    expect(await response.json()).toMatchObject({
      similar: [{ id: 2, full_name: 'peer/store', similarity: 0.8 }],
    });
  });

  it('does not resolve an unused session for the default global scope', async () => {
    const response = await GET(new NextRequest('http://localhost/api/repos/1/similar'), {
      params: Promise.resolve({ repoId: '1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
