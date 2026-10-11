import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
vi.mock('@/db', () => ({ db: { execute } }));

import { getPublicRepo, repositorySlug } from '@/lib/public-repo';

const row = {
  id: 1,
  name: 'example',
  full_name: 'fleet/example',
  owner_login: 'fleet',
  owner_avatar: 'https://example.com/avatar.png',
  html_url: 'https://github.com/fleet/example',
  description: 'Useful public repository',
  language: 'TypeScript',
  stargazers_count: 42,
  archived: 0,
  topics: '["testing"]',
  repo_created_at: null,
  repo_updated_at: null,
  notes: 'private user note',
  accessToken: 'must-not-be-serialized',
};

describe('public server repository lookup', () => {
  beforeEach(() => {
    execute.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads public fields without authentication, network work or cache writes', async () => {
    execute.mockResolvedValue({ rows: [row] });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const repo = await getPublicRepo('fleet/example');
    expect(repo).toMatchObject({
      full_name: 'fleet/example',
      topics: ['testing'],
      archived: false,
    });
    expect(repo).not.toHaveProperty('notes');
    expect(repo).not.toHaveProperty('accessToken');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].sql).not.toContain('user_');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders an uncataloged public GitHub record without inserting it', async () => {
    execute.mockResolvedValue({ rows: [] });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        ...row,
        owner: { login: 'fleet', avatar_url: row.owner_avatar },
        topics: ['testing'],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      })
    );
    expect(await getPublicRepo('fleet/example')).toMatchObject({
      name: 'example',
      topics: ['testing'],
      repo_updated_at: '2026-10-01T00:00:00Z',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('recognizes a genuine GitHub 404', async () => {
    execute.mockResolvedValue({ rows: [] });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    expect(await getPublicRepo('fleet/missing')).toBeNull();
  });

  it.each([403, 429, 500, 502])(
    'does not turn provider status %s into a missing repository',
    async (status) => {
      execute.mockResolvedValue({ rows: [] });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }));
      await expect(getPublicRepo('fleet/example')).rejects.toThrow(`lookup failed: ${status}`);
    }
  );

  it('propagates a database outage instead of returning a false 404', async () => {
    execute.mockRejectedValue(new Error('D1 unavailable'));
    await expect(getPublicRepo('fleet/example')).rejects.toThrow('D1 unavailable');
  });

  it.each([
    [],
    ['owner'],
    ['owner', 'repo', 'extra'],
    ['bad owner', 'repo'],
    ['owner', '..'],
    ['owner', 'repo?x=1'],
  ])('rejects malformed repository paths %j', (...parts) => {
    expect(repositorySlug(parts as string[])).toBeNull();
  });
});
