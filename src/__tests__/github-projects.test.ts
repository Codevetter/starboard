import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPublicGitHubProject,
  fetchPublicGitHubRepositories,
  parseGitHubProjectInput,
} from '@/lib/github-projects';

const slug = { owner: 'openai', repo: 'openai-node', fullName: 'openai/openai-node' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseGitHubProjectInput', () => {
  it.each([
    ['openai/openai-node', 'openai/openai-node'],
    ['https://github.com/openai/openai-node', 'openai/openai-node'],
    ['https://github.com/openai/openai-node.git/', 'openai/openai-node'],
  ])('normalizes %s', (input, fullName) => {
    expect(parseGitHubProjectInput(input)?.fullName).toBe(fullName);
  });

  it.each([
    '',
    'openai',
    'openai/openai-node/issues',
    'https://example.com/openai/openai-node',
    'git://github.com/openai/openai-node',
    'http://[',
    '-invalid/repo',
    'valid-owner/',
  ])('rejects invalid input %s', (input) => {
    expect(parseGitHubProjectInput(input)).toBeNull();
  });

  it('fetches and maps a public repository with authenticated GitHub headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 1,
          name: 'openai-node',
          full_name: 'openai/openai-node',
          private: false,
          visibility: 'public',
          owner: { login: 'openai', avatar_url: 'https://example.com/openai.png' },
          html_url: 'https://github.com/openai/openai-node',
          description: 'Official JavaScript library',
          language: 'TypeScript',
          stargazers_count: 10_000,
          archived: true,
          topics: ['openai'],
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicGitHubProject(slug, 'token')).resolves.toMatchObject({
      id: 1,
      fullName: 'openai/openai-node',
      archived: true,
      topics: ['openai'],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/openai/openai-node',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      })
    );
  });

  it('supports unauthenticated public lookup and defaults optional metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 1,
          name: 'openai-node',
          full_name: 'openai/openai-node',
          private: false,
          owner: { login: 'openai', avatar_url: '' },
          html_url: 'https://github.com/openai/openai-node',
          description: null,
          language: null,
          stargazers_count: 0,
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicGitHubProject(slug)).resolves.toMatchObject({
      archived: false,
      topics: [],
    });
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('returns null for missing, private, and non-public repositories', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ private: true, visibility: 'private' })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ private: false, visibility: 'internal' }))
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicGitHubProject(slug)).resolves.toBeNull();
    await expect(fetchPublicGitHubProject(slug)).resolves.toBeNull();
    await expect(fetchPublicGitHubProject(slug)).resolves.toBeNull();
  });

  it('surfaces non-404 GitHub failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(fetchPublicGitHubProject(slug)).rejects.toThrow('GitHub API error: 503');
  });

  it('loads only public repository choices with the existing user token', async () => {
    const publicRepo = {
      id: 1,
      name: 'openai-node',
      full_name: 'openai/openai-node',
      private: false,
      visibility: 'public',
      owner: { login: 'openai', avatar_url: '' },
      html_url: 'https://github.com/openai/openai-node',
      description: null,
      language: 'TypeScript',
      stargazers_count: 10,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([publicRepo, { ...publicRepo, id: 2, private: true }]))
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicGitHubRepositories('token')).resolves.toEqual([
      expect.objectContaining({ id: 1, fullName: 'openai/openai-node' }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/user/repos?'),
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      })
    );
  });

  it('surfaces GitHub failures while loading repository choices', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(fetchPublicGitHubRepositories('token')).rejects.toThrow('GitHub API error: 503');
  });
});
