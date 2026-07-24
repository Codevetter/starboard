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

  it('serves the public corpus to guests with null personalized state', async () => {
    mocks.auth.mockResolvedValueOnce(null);

    const response = await GET(new NextRequest('http://localhost/api/discover'));

    expect(response.status).toBe(200);
    const mainQuery = mocks.execute.mock.calls[0]?.[0] as { sql: string; args: unknown[] };
    expect(mainQuery.args.slice(0, 2)).toEqual([null, null]);

    const batchedQueries = mocks.batch.mock.calls[0]?.[0] as Array<{
      sql: string;
      args: unknown[];
    }>;
    expect(batchedQueries[2].sql).not.toContain('user_lists');
    expect(batchedQueries[2].args).toEqual([]);
  });

  it('rejects guest collection filters before querying personalized state', async () => {
    mocks.auth.mockResolvedValueOnce(null);

    const response = await GET(new NextRequest('http://localhost/api/discover?list_id=42'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Authentication required for list filters',
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  // Regression guard: the eligibility filter must use the index-friendly
  // IN (UNION) form, not the OR EXISTS correlated subquery that forced
  // O(|repos| × |user_repos|) row reads per request (the 500M-row burn).
  // See scripts/enrich-tools.ts loadPending for the same pattern.
  it('uses an index-friendly eligibility filter (no OR EXISTS anti-pattern)', async () => {
    await GET(new NextRequest('http://localhost/api/discover'));

    const calls = mocks.execute.mock.calls.map((call) => {
      const arg = call[0];
      return typeof arg === 'string' ? arg : (arg as { sql: string }).sql;
    });
    const allSql = calls.join('\n');

    expect(allSql).not.toMatch(/OR\s+EXISTS\s*\(/i);
    expect(allSql).toMatch(/IN\s*\(\s*SELECT[\s\S]*UNION\s+SELECT[\s\S]*user_repos/i);
  });
});
