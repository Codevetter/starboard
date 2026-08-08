import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  execute: vi.fn(),
  batch: vi.fn(),
  fetchProject: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/db', () => ({ db: { execute: mocks.execute, batch: mocks.batch } }));
vi.mock('@/lib/github-projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/github-projects')>()),
  fetchPublicGitHubProject: mocks.fetchProject,
}));

import { GET as getRecommendations } from '@/app/api/projects/[slug]/recommendations/route';
import { DELETE } from '@/app/api/projects/[slug]/route';
import { GET, POST } from '@/app/api/projects/route';

const connectedRow = {
  id: 42,
  name: 'app',
  full_name: 'acme/app',
  owner_login: 'acme',
  owner_avatar: 'https://example.com/avatar.png',
  html_url: 'https://github.com/acme/app',
  description: 'A TypeScript application',
  language: 'TypeScript',
  stargazers_count: 100,
  archived: 0,
  topics: '["nextjs"]',
  connected_at: '2026-08-08T00:00:00Z',
  ai_summary: null,
  ai_category: null,
  ai_keywords: '[]',
  tools: '[]',
};

describe('connected project APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      accessToken: 'token',
      user: { githubId: 'user-1' },
    });
    mocks.execute.mockResolvedValue({ rows: [], rowsAffected: 0 });
    mocks.batch.mockResolvedValue([]);
  });

  it('requires authentication before listing projects', async () => {
    mocks.auth.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('connects a public repository to only the signed-in user', async () => {
    mocks.fetchProject.mockResolvedValue({
      id: 42,
      name: 'app',
      fullName: 'acme/app',
      ownerLogin: 'acme',
      ownerAvatar: 'https://example.com/avatar.png',
      htmlUrl: 'https://github.com/acme/app',
      description: 'A TypeScript application',
      language: 'TypeScript',
      stargazersCount: 100,
      archived: false,
      topics: ['nextjs'],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-08-08T00:00:00Z',
    });
    mocks.execute.mockResolvedValueOnce({ rows: [connectedRow], rowsAffected: 0 });

    const response = await POST(
      new NextRequest('http://localhost/api/projects', {
        method: 'POST',
        body: JSON.stringify({ repository: 'https://github.com/acme/app' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(response.status).toBe(201);
    const statements = mocks.batch.mock.calls[0]?.[0] as Array<{
      sql: string;
      args: unknown[];
    }>;
    expect(statements[1].sql).toContain('INSERT INTO user_projects');
    expect(statements[1].args).toEqual(['user-1', 42]);
  });

  it("does not reveal another user's connected project", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [], rowsAffected: 0 });

    const response = await getRecommendations(
      new NextRequest('http://localhost/api/projects/42/recommendations'),
      { params: Promise.resolve({ slug: '42' }) }
    );

    expect(response.status).toBe(404);
    const query = mocks.execute.mock.calls[0]?.[0] as { sql: string; args: unknown[] };
    expect(query.sql).toContain('WHERE up.user_id = ? AND up.repo_id = ?');
    expect(query.args).toEqual(['user-1', 42]);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('returns similar repositories and tools grounded in those peers', async () => {
    mocks.execute
      .mockResolvedValueOnce({
        rows: [
          {
            ...connectedRow,
            tools: '[{"key":"nextjs","name":"Next.js","category":"framework","confidence":98}]',
          },
        ],
        rowsAffected: 0,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 84,
            name: 'peer',
            full_name: 'oss/peer',
            html_url: 'https://github.com/oss/peer',
            description: 'A TypeScript application peer',
            language: 'TypeScript',
            stargazers_count: 10_000,
            archived: 0,
            topics: '["nextjs"]',
            ai_summary: null,
            ai_category: null,
            ai_keywords: '[]',
            tools: '[{"key":"vitest","name":"Vitest","category":"testing","confidence":93}]',
          },
        ],
        rowsAffected: 0,
      });

    const response = await getRecommendations(
      new NextRequest('http://localhost/api/projects/42/recommendations?limit=10'),
      { params: Promise.resolve({ slug: '42' }) }
    );
    const payload = (await response.json()) as {
      similarProjects: Array<{ id: number; fullName: string }>;
      recommendedTools: Array<{
        key: string;
        supportCount: number;
        sources: Array<{ repoId: number; fullName: string; confidence: number }>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(payload.similarProjects[0]).toMatchObject({ id: 84, fullName: 'oss/peer' });
    expect(payload.recommendedTools[0]).toMatchObject({
      key: 'vitest',
      supportCount: 1,
      sources: [expect.objectContaining({ repoId: 84, fullName: 'oss/peer', confidence: 93 })],
    });
  });

  it('disconnects only the signed-in user relation', async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [], rowsAffected: 1 });

    const response = await DELETE(new Request('http://localhost/api/projects/42'), {
      params: Promise.resolve({ slug: '42' }),
    });

    expect(response.status).toBe(204);
    expect(mocks.execute).toHaveBeenCalledWith({
      sql: 'DELETE FROM user_projects WHERE user_id = ? AND repo_id = ?',
      args: ['user-1', 42],
    });
  });
});
