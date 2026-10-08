import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execute, batch, queryByRepoId, upsert, reserveStorage, generateEmbeddings } = vi.hoisted(
  () => ({
    execute: vi.fn(),
    batch: vi.fn(),
    queryByRepoId: vi.fn(),
    upsert: vi.fn(),
    reserveStorage: vi.fn(),
    generateEmbeddings: vi.fn(),
  })
);
vi.mock('@/db', () => ({ db: { execute, batch } }));
vi.mock('@/lib/repo-vectors', () => ({
  repoVectors: () => ({ queryByRepoId, upsert, reserveStorage }),
}));
vi.mock('@/lib/embeddings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/embeddings')>('@/lib/embeddings');
  return { ...actual, generateEmbeddings };
});

import { GET, POST } from '@/app/api/internal/embed-pending/route';
import { buildEmbeddingFromRow } from '@/lib/embeddings';
import { SharedBudgetDeniedError } from '@/lib/shared-ai-budget';

function row(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    full_name: `synthetic/repository-${id}`,
    description: 'Synthetic demand fixture',
    language: 'TypeScript',
    topics: '["fixture"]',
    summary: null,
    ...extra,
  };
}

function demandRequest(limit?: string, token = 'synthetic-operator') {
  const url = new URL('https://starboard.test/api/internal/embed-pending');
  url.searchParams.set('mode', 'demand');
  if (limit !== undefined) url.searchParams.set('limit', limit);
  return new Request(url, { headers: { Authorization: `Bearer ${token}` } });
}

describe('operator embedding demand aggregates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('STARBOARD_OPERATOR_TOKEN', 'synthetic-operator');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('counts missing and changed hashes including metadata without returning row data', async () => {
    const unchanged = row(1);
    const missing = row(2, { text_hash: null });
    const changed = row(3, { description: 'Changed synthetic description' });
    const changedMetadata = row(4, { summary: 'Updated synthetic summary' });
    execute.mockResolvedValue({
      rows: [
        { ...unchanged, text_hash: buildEmbeddingFromRow(unchanged).hash },
        missing,
        { ...changed, text_hash: buildEmbeddingFromRow(row(3)).hash },
        { ...changedMetadata, text_hash: buildEmbeddingFromRow(row(4)).hash },
      ],
    });

    const response = await GET(demandRequest('2'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      eligible: 4,
      pending: 3,
      missing: 1,
      changed: 2,
      selected: 2,
      remaining: 1,
      limit: 2,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(queryByRepoId).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('returns exact zero demand for current hashes and retains the default limit', async () => {
    const unchanged = row(5);
    execute.mockResolvedValue({
      rows: [{ ...unchanged, text_hash: buildEmbeddingFromRow(unchanged).hash }],
    });
    const response = await GET(demandRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      eligible: 1,
      pending: 0,
      missing: 0,
      changed: 0,
      selected: 0,
      remaining: 0,
      limit: 3000,
    });
    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(queryByRepoId).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('caps the selected prefix while retaining full pending and remaining demand', async () => {
    execute.mockResolvedValue({ rows: Array.from({ length: 3001 }, (_, i) => row(i)) });
    const response = await GET(demandRequest('99999'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      eligible: 3001,
      pending: 3001,
      missing: 3001,
      changed: 0,
      selected: 3000,
      remaining: 1,
      limit: 3000,
    });
    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(queryByRepoId).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', '1.5', '', 'Infinity', 'invalid'])(
    'rejects limit %j before D1 access',
    async (limit) => {
      const response = await GET(demandRequest(limit));
      expect(response.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
      expect(generateEmbeddings).not.toHaveBeenCalled();
      expect(queryByRepoId).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
      expect(batch).not.toHaveBeenCalled();
    }
  );

  it('rejects other credentials before data access', async () => {
    const response = await GET(demandRequest('35', 'synthetic-other'));
    expect(response.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(queryByRepoId).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('preserves default GET binding probe behavior', async () => {
    execute.mockResolvedValue({ rows: [{ repo_id: 7 }] });
    queryByRepoId.mockResolvedValue([]);
    const response = await GET(
      new Request('https://starboard.test/api/internal/embed-pending', {
        headers: { Authorization: 'Bearer synthetic-operator' },
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, bindings: { d1: 'ok', vectorize: 'ok' } });
    expect(queryByRepoId).toHaveBeenCalledWith(7, 1);
    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it('denies admission after read-only demand, before inference or vector writes', async () => {
    execute.mockResolvedValue({ rows: [row(1)] });
    reserveStorage.mockRejectedValue(new SharedBudgetDeniedError());
    const response = await POST(
      new Request('https://starboard.test/api/internal/embed-pending', {
        method: 'POST',
        headers: { Authorization: 'Bearer synthetic-operator', 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 35 }),
      })
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Shared AI budget is unavailable or exhausted.',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(generateEmbeddings).not.toHaveBeenCalled();
    expect(queryByRepoId).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });
  it('reserves before inference and checkpoints only after the admitted write', async () => {
    const admission = Symbol('test-admission');
    execute.mockResolvedValue({ rows: [row(1)] });
    reserveStorage.mockResolvedValue(admission);
    generateEmbeddings.mockResolvedValue([Array(768).fill(0)]);
    upsert.mockResolvedValue(undefined);
    batch.mockResolvedValue(undefined);
    const response = await POST(
      new Request('https://starboard.test/api/internal/embed-pending', {
        method: 'POST',
        headers: { Authorization: 'Bearer synthetic-operator', 'Content-Type': 'application/json' },
        body: '{"limit":1}',
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ embedded: 1, remaining: 0 });
    expect(reserveStorage).toHaveBeenCalledExactlyOnceWith(1);
    expect(reserveStorage.mock.invocationCallOrder[0]).toBeLessThan(
      generateEmbeddings.mock.invocationCallOrder[0]
    );
    expect(upsert).toHaveBeenCalledWith([{ repoId: 1, values: Array(768).fill(0) }], admission);
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(batch.mock.invocationCallOrder[0]);
  });

  it('never checkpoints an ambiguous failed write', async () => {
    execute.mockResolvedValue({ rows: [row(1)] });
    reserveStorage.mockResolvedValue(Symbol('test-admission'));
    generateEmbeddings.mockResolvedValue([Array(768).fill(0)]);
    upsert.mockRejectedValue(new Error('ambiguous write'));
    await expect(
      POST(
        new Request('https://starboard.test/api/internal/embed-pending', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer synthetic-operator',
            'Content-Type': 'application/json',
          },
          body: '{"limit":1}',
        })
      )
    ).rejects.toThrow('ambiguous write');
    expect(batch).not.toHaveBeenCalled();
  });
});
