import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  execute: vi.fn(),
  batch: vi.fn(),
  searchStarboardRagOrEmpty: vi.fn(),
  trackSearchOutcome: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/db', () => ({
  db: {
    execute: mocks.execute,
    batch: mocks.batch,
  },
}));
vi.mock('@/lib/knowledgebase', () => ({
  searchStarboardRagOrEmpty: mocks.searchStarboardRagOrEmpty,
}));
vi.mock('@/lib/analytics', () => ({
  trackSearchOutcome: mocks.trackSearchOutcome,
}));

import { GET } from '@/app/api/stars/route';

const starRow = {
  id: 11,
  name: 'next.js',
  full_name: 'vercel/next.js',
  owner_login: 'vercel',
  owner_avatar: 'https://example.com/vercel.png',
  html_url: 'https://github.com/vercel/next.js',
  description: 'The React Framework',
  language: 'TypeScript',
  stargazers_count: 130_000,
  archived: 0,
  topics: '["react","nextjs"]',
  repo_created_at: '2016-10-25T00:00:00Z',
  repo_updated_at: '2026-08-01T00:00:00Z',
  list_id: null,
  collection_ids: '[]',
  notes: null,
  starred_at: '2026-07-01T00:00:00Z',
  is_starred: 1,
  is_saved: 0,
};

function queryArg(call: unknown): { sql: string; args: unknown[] } {
  return call as { sql: string; args: unknown[] };
}

describe('GET /api/stars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { githubId: 'user-1' } });
    mocks.searchStarboardRagOrEmpty.mockResolvedValue([]);
    mocks.execute.mockResolvedValue({ rows: [starRow] });
    mocks.batch.mockResolvedValue([
      { rows: [{ total: 1 }] },
      { rows: [{ language: 'TypeScript', count: 1 }] },
      { rows: [{ id: 7, name: 'Frontend', color: '#111111', count: 1 }] },
    ]);
  });

  it('returns 401 when the session has no githubId', async () => {
    mocks.auth.mockResolvedValueOnce(null);

    const response = await GET(new NextRequest('http://localhost/api/stars'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(mocks.searchStarboardRagOrEmpty).not.toHaveBeenCalled();
  });

  it('treats a signed-in session without githubId as unauthorized', async () => {
    mocks.auth.mockResolvedValueOnce({ user: {} });

    const response = await GET(
      new NextRequest('http://localhost/api/stars?q=nextjs&sort=relevance')
    );

    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.searchStarboardRagOrEmpty).not.toHaveBeenCalled();
  });

  it('binds the signed-in user and filters as SQL parameters', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/stars?language=TypeScript&limit=10&offset=5')
    );

    expect(response.status).toBe(200);
    const mainQuery = queryArg(mocks.execute.mock.calls[0]?.[0]);
    expect(mainQuery.sql).toContain('ur.user_id = ?');
    expect(mainQuery.sql).toContain('r.language IN (SELECT CAST(value AS TEXT) FROM json_each(?))');
    expect(mainQuery.sql).not.toContain('user-1');
    expect(mainQuery.args).toEqual(['user-1', JSON.stringify(['TypeScript']), 10, 5]);

    const batched = mocks.batch.mock.calls[0]?.[0] as Array<{ sql: string; args: unknown[] }>;
    expect(batched[0].sql).toContain('ur.user_id = ?');
    expect(batched[0].args).toEqual(['user-1', JSON.stringify(['TypeScript'])]);
    expect(batched[1].args).toEqual(['user-1']);
    expect(batched[2].args).toEqual(['user-1']);

    await expect(response.json()).resolves.toMatchObject({
      repos: [{ id: 11, full_name: 'vercel/next.js' }],
      total: 1,
      facets: {
        languages: [['TypeScript', 1]],
        lists: [{ id: 7, name: 'Frontend', count: 1 }],
      },
    });
    expect(mocks.searchStarboardRagOrEmpty).not.toHaveBeenCalled();
    expect(mocks.trackSearchOutcome).not.toHaveBeenCalled();
  });

  it('falls back to lexical matches when knowledgebase RAG is empty', async () => {
    mocks.execute.mockImplementation(async (statement: { sql: string; args: unknown[] }) => {
      if (statement.sql.includes('repos_fts MATCH')) {
        return { rows: [{ id: 11 }] };
      }
      return { rows: [starRow] };
    });

    const response = await GET(
      new NextRequest('http://localhost/api/stars?q=nextjs&sort=relevance')
    );

    expect(response.status).toBe(200);
    expect(mocks.searchStarboardRagOrEmpty).toHaveBeenCalledWith('user-1', 'nextjs nextjs', 500);

    const lexicalQuery = queryArg(
      mocks.execute.mock.calls.find((call) =>
        queryArg(call[0]).sql.includes('repos_fts MATCH')
      )?.[0]
    );
    expect(lexicalQuery.args).toEqual(['user-1', 'nextjs*', 'user-1', 'nextjs*']);

    const mainQuery = queryArg(
      mocks.execute.mock.calls.find((call) =>
        queryArg(call[0]).sql.includes('LIMIT ? OFFSET ?')
      )?.[0]
    );
    expect(mainQuery.sql).toContain('r.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))');
    expect(mainQuery.sql).toContain('CASE r.id WHEN 11 THEN 0');
    expect(mainQuery.sql).not.toContain('0 = 1');
    expect(mainQuery.args).toEqual(['user-1', JSON.stringify([11]), 50, 0]);

    const payload = (await response.json()) as { repos: Array<{ id: number }>; total: number };
    expect(payload.repos).toEqual([expect.objectContaining({ id: 11 })]);
    expect(mocks.trackSearchOutcome).toHaveBeenCalledWith('semantic', 1);
  });
});
