import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: { execute: mocks.execute },
}));

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('probes the real lexical-search capability', async () => {
    mocks.execute.mockResolvedValue({ rows: [] });

    const response = await GET();
    const payload = (await response.json()) as {
      ok: boolean;
      indexing: { search_probe: boolean };
      surfaces: { search: string; landing: string };
    };

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith({
      sql: expect.stringContaining('repos_fts MATCH ?'),
      args: ['starboard_health_probe'],
    });
    expect(payload.ok).toBe(true);
    expect(payload.indexing.search_probe).toBe(true);
    expect(payload.surfaces.search).toBe('ok');
    expect(payload.surfaces.landing).toBe('unverified');
  });

  it('returns 503 with a sanitized public error when search is unavailable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.execute.mockRejectedValue(
      new Error('libsql failed for https://private.example?token=operator-secret')
    );

    const response = await GET();
    const payload = (await response.json()) as {
      ok: boolean;
      errors: { search: string };
      surfaces: { search: string };
    };
    const publicBody = JSON.stringify(payload);

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.errors.search).toBe('search_capability_unavailable');
    expect(payload.surfaces.search).toBe('unavailable');
    expect(publicBody).not.toContain('private.example');
    expect(publicBody).not.toContain('operator-secret');
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
