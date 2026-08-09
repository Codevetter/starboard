import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/db', () => ({ db: { execute: mocks.execute } }));

import { GET } from '@/app/api/tools/route';

describe('GET /api/tools tool evidence pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.execute
      .mockResolvedValueOnce({
        rows: [
          {
            tool_key: 'react',
            tool_name: 'React',
            category: 'framework',
            repo_count: 120,
            avg_confidence: 95,
            max_confidence: 98,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 51,
            name: 'app',
            full_name: 'acme/app',
            owner_login: 'acme',
            owner_avatar: '',
            html_url: 'https://github.com/acme/app',
            description: 'A dashboard',
            language: 'TypeScript',
            stargazers_count: 20_000,
            archived: 0,
            topics: '[]',
            repo_created_at: '2025-01-01T00:00:00Z',
            repo_updated_at: '2026-01-01T00:00:00Z',
            tool_key: 'react',
            tool_name: 'React',
            category: 'framework',
            confidence: 98,
            sources: '["package.json"]',
          },
        ],
      });
  });

  it('filters before applying a bounded limit and offset', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/tools?tool=react&q=TypeScript&limit=500&offset=48')
    );

    expect(response.status).toBe(200);
    const resultQuery = mocks.execute.mock.calls[1][0] as { sql: string; args: unknown[] };
    expect(resultQuery.sql).toContain("LOWER(r.full_name) LIKE ? ESCAPE '\\'");
    expect(resultQuery.sql).toContain('LIMIT ? OFFSET ?');
    expect(resultQuery.args.slice(-5)).toEqual([
      '%typescript%',
      '%typescript%',
      '%typescript%',
      100,
      48,
    ]);

    expect(await response.json()).toMatchObject({
      tool: { repoCount: 120 },
      repos: [{ id: 51 }],
      page: { offset: 48, limit: 100, hasMore: true },
    });
  });

  it('keeps personal tool evidence protected', async () => {
    mocks.execute.mockReset();

    const response = await GET(new NextRequest('http://localhost/api/tools?tool=react&scope=user'));

    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
