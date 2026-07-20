import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  execute: vi.fn(),
  batch: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/db', () => ({
  db: {
    execute: mocks.execute,
    batch: mocks.batch,
  },
}));

import { GET } from '@/app/api/discover/route';

describe('GET /api/discover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { githubId: 'user-1' } });
    mocks.execute.mockResolvedValue({
      rows: [
        {
          id: 1,
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
          list_id: null,
          collection_ids: '[]',
          notes: null,
          starred_at: null,
          is_starred: 0,
          is_saved: 0,
          star_growth_30d: 250,
        },
      ],
    });
    mocks.batch.mockResolvedValue([
      { rows: [{ total: 1 }] },
      { rows: [['TypeScript', 1]] },
      { rows: [] },
      { rows: [{ tool_key: 'react', tool_name: 'React', count: 1 }] },
    ]);
  });

  it('applies growth ordering and detected-tool facets without network work', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/discover?sort=growth&tool=react')
    );

    expect(response.status).toBe(200);
    const mainQuery = mocks.execute.mock.calls[0]?.[0] as { sql: string; args: unknown[] };
    expect(mainQuery.sql).toContain('star_growth_30d DESC');
    expect(mainQuery.sql).toContain('repo_tools selected_tools');
    expect(mainQuery.args).toContain('react');

    const payload = (await response.json()) as {
      repos: Array<{ star_growth_30d: number }>;
      facets: { tools: Array<{ key: string; name: string; count: number }> };
    };
    expect(payload.repos[0].star_growth_30d).toBe(250);
    expect(payload.facets.tools).toEqual([{ key: 'react', name: 'React', count: 1 }]);
  });

  it('rejects unauthenticated requests before querying the database', async () => {
    mocks.auth.mockResolvedValueOnce(null);

    const response = await GET(new NextRequest('http://localhost/api/discover'));

    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
