import { describe, expect, it, vi } from 'vitest';

import { createRepoVectorStore, type VectorizeIndexLike } from './repo-vectors';
import { denyVectorizeStorageGrowth, SharedBudgetDeniedError } from './shared-ai-budget';

const testBudget = () => ({
  reserveQuery: vi.fn(async (_dimensions: number) => {}),
  reserveStorage: vi.fn(async (_dimensions: number) => {}),
});

describe('repo vector store', () => {
  it('logs only a fixed query category and rethrows the original Vectorize failure', async () => {
    const error = new Error('private vector payload project-1377518513');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const index = {
      query: vi.fn(),
      queryById: vi.fn().mockRejectedValue(error),
      upsert: vi.fn(),
    } as unknown as VectorizeIndexLike;

    try {
      await expect(
        createRepoVectorStore(index, testBudget()).queryByRepoId(1377518513, 10)
      ).rejects.toBe(error);
      expect(warning.mock.calls).toEqual([
        ['[starboard-semantic-diagnostic]', { stage: 'vectorize_query', reason: 'rejected' }],
      ]);
      expect(JSON.stringify(warning.mock.calls)).not.toMatch(/private|1377518513/);
    } finally {
      warning.mockRestore();
    }
  });

  it('labels a known query budget denial without logging its message or query dimensions', async () => {
    const error = new SharedBudgetDeniedError('private quota state project-1377518513');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const budget = {
      ...testBudget(),
      reserveQuery: vi.fn().mockRejectedValue(error),
    };
    const index = {
      query: vi.fn(),
      queryById: vi.fn(),
      upsert: vi.fn(),
    } as unknown as VectorizeIndexLike;

    try {
      await expect(createRepoVectorStore(index, budget).queryByRepoId(1377518513, 10)).rejects.toBe(
        error
      );
      expect(warning.mock.calls).toEqual([
        [
          '[starboard-semantic-diagnostic]',
          { stage: 'vector_budget_reservation', reason: 'denied' },
        ],
      ]);
      expect(JSON.stringify(warning.mock.calls)).not.toMatch(/private|1377518513|768/);
      expect(index.queryById).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it('does not label an unknown budget failure as a denial', async () => {
    const error = new Error('private reservation transport detail project-1377518513');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const budget = {
      ...testBudget(),
      reserveQuery: vi.fn().mockRejectedValue(error),
    };
    const index = {
      query: vi.fn(),
      queryById: vi.fn(),
      upsert: vi.fn(),
    } as unknown as VectorizeIndexLike;

    try {
      await expect(createRepoVectorStore(index, budget).queryByRepoId(1377518513, 10)).rejects.toBe(
        error
      );
      expect(warning.mock.calls).toEqual([
        [
          '[starboard-semantic-diagnostic]',
          { stage: 'vector_budget_reservation', reason: 'rejected' },
        ],
      ]);
      expect(JSON.stringify(warning.mock.calls)).not.toMatch(/private|1377518513|768/);
      expect(index.queryById).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it('maps cosine scores to the existing distance contract', async () => {
    const index = {
      query: vi.fn().mockResolvedValue({
        matches: [
          { id: '42', score: 0.91 },
          { id: 'not-an-id', score: 0.8 },
        ],
      }),
      queryById: vi.fn(),
      upsert: vi.fn(),
    } as unknown as VectorizeIndexLike;

    const matches = await createRepoVectorStore(index, testBudget()).query([0.1, 0.2], 20);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.repoId).toBe(42);
    expect(matches[0]?.distance).toBeCloseTo(0.09);
  });

  it('uses the repository id as both Vectorize id and metadata', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const index = {
      query: vi.fn(),
      queryById: vi.fn(),
      upsert,
    } as unknown as VectorizeIndexLike;

    await createRepoVectorStore(index, testBudget()).upsert([
      { repoId: 7, values: Array(768).fill(0.2) },
    ]);

    expect(upsert).toHaveBeenCalledWith([
      { id: '7', values: Array(768).fill(0.2), metadata: { repoId: 7 } },
    ]);
  });

  it('does not write any vectors when storage headroom is not verified', async () => {
    const upsert = vi.fn();
    const index = { query: vi.fn(), queryById: vi.fn(), upsert } as unknown as VectorizeIndexLike;
    const vectors = createRepoVectorStore(index, {
      ...testBudget(),
      reserveStorage: async () => denyVectorizeStorageGrowth(),
    });

    await expect(vectors.upsert([{ repoId: 7, values: Array(768).fill(0) }])).rejects.toThrow(
      /storage growth is disabled/
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('caps queries at the current Vectorize topK limit', async () => {
    const query = vi.fn().mockResolvedValue({ matches: [] });
    const index = {
      query,
      queryById: vi.fn(),
      upsert: vi.fn(),
    } as unknown as VectorizeIndexLike;

    await createRepoVectorStore(index, testBudget()).query([0.1, 0.2], 200);

    expect(query).toHaveBeenCalledWith([0.1, 0.2], {
      topK: 100,
      returnValues: false,
      returnMetadata: 'none',
    });
  });

  it('uses a request-local admission once to preflight before an embedding is generated', async () => {
    const reserveQuery = vi.fn(async (_dimensions: number) => {});
    const index = {
      query: vi.fn().mockResolvedValue({ matches: [] }),
      queryById: vi.fn(),
      upsert: vi.fn(),
    } as unknown as VectorizeIndexLike;
    const vectors = createRepoVectorStore(index, { ...testBudget(), reserveQuery });
    const admission = await vectors.reserveQuery(768);

    await vectors.query(Array(768).fill(0), 10, admission);

    expect(reserveQuery).toHaveBeenCalledTimes(1);
    expect(reserveQuery).toHaveBeenCalledWith(768);
  });

  it('charges raw vector queries and query-by-id when no preflight admission exists', async () => {
    const budget = testBudget();
    const index = {
      query: vi.fn().mockResolvedValue({ matches: [] }),
      queryById: vi.fn().mockResolvedValue({ matches: [] }),
      upsert: vi.fn(),
    } as unknown as VectorizeIndexLike;
    const vectors = createRepoVectorStore(index, budget);

    await vectors.query([0.1, 0.2], 10);
    await vectors.queryByRepoId(7, 10);

    expect(budget.reserveQuery.mock.calls).toEqual([[2], [768]]);
  });
  it('consumes each correctly sized admission once, including failed writes', async () => {
    const upsert = vi.fn().mockRejectedValue(new Error('ambiguous write'));
    const budget = testBudget();
    const index = { query: vi.fn(), queryById: vi.fn(), upsert } as unknown as VectorizeIndexLike;
    const vectors = createRepoVectorStore(index, budget);
    const admission = await vectors.reserveStorage(1);
    const input = [{ repoId: 7, values: Array(768).fill(0) }];
    await expect(vectors.upsert(input, Symbol('forged'))).rejects.toThrow();
    await expect(vectors.upsert([...input, ...input], admission)).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
    await expect(vectors.upsert(input, admission)).rejects.toThrow('ambiguous write');
    await expect(vectors.upsert(input, admission)).rejects.toThrow();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(budget.reserveStorage).toHaveBeenCalledExactlyOnceWith(768);
  });

  it.each([769, 1536, 3072])(
    'rejects raw %i-dimensional writes before admission',
    async (dimensions) => {
      const upsert = vi.fn();
      const budget = testBudget();
      const index = { query: vi.fn(), queryById: vi.fn(), upsert } as unknown as VectorizeIndexLike;
      await expect(
        createRepoVectorStore(index, budget).upsert([
          { repoId: 7, values: Array(dimensions).fill(0) },
        ])
      ).rejects.toThrow(/raw finite 768/);
      expect(upsert).not.toHaveBeenCalled();
      expect(budget.reserveStorage).not.toHaveBeenCalled();
    }
  );

  it('rejects an admission held across an unverified month boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T23:59:59Z'));
    try {
      const upsert = vi.fn();
      const index = { query: vi.fn(), queryById: vi.fn(), upsert } as unknown as VectorizeIndexLike;
      const vectors = createRepoVectorStore(index, testBudget());
      const admission = await vectors.reserveStorage(1);
      vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
      await expect(
        vectors.upsert([{ repoId: 7, values: Array(768).fill(0) }], admission)
      ).rejects.toThrow();
      expect(upsert).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
