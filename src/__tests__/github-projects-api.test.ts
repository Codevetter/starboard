import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  fetchRepositories: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/github-projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/github-projects')>()),
  fetchPublicGitHubRepositories: mocks.fetchRepositories,
}));

import { GET } from '@/app/api/github/projects/route';

describe('GitHub project picker API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ accessToken: 'token', user: { githubId: '1' } });
    mocks.fetchRepositories.mockResolvedValue([{ id: 1, fullName: 'acme/app' }]);
  });

  it('requires an authenticated GitHub token', async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.fetchRepositories).not.toHaveBeenCalled();
  });

  it('links to the GitHub OAuth app page so users can grant more organizations', async () => {
    process.env.AUTH_GITHUB_ID = 'test-client-id';
    try {
      const response = await GET();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        orgAccessUrl: 'https://github.com/settings/connections/applications/test-client-id',
      });
    } finally {
      delete process.env.AUTH_GITHUB_ID;
    }
  });

  it('returns every public repository choice loaded by the GitHub fetcher', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      repositories: [{ id: 1, fullName: 'acme/app' }],
      orgAccessUrl: null,
    });
    expect(mocks.fetchRepositories).toHaveBeenCalledWith('token');
  });
});
