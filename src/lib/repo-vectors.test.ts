import { describe, expect, it, vi } from 'vitest';

import { createRepoVectorStore, type VectorizeIndexLike } from './repo-vectors';
import { denyVectorizeStorageGrowth } from './shared-ai-budget';

const testBudget = () => ({
  reserveQuery: vi.fn(async (_dimensions: number) => {}),
  denyStorageGrowth: () => {},
});

describe('repo vector store', () => {
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

    await createRepoVectorStore(index, testBudget()).upsert([{ repoId: 7, values: [0.2, 0.3] }]);

    expect(upsert).toHaveBeenCalledWith([{ id: '7', values: [0.2, 0.3], metadata: { repoId: 7 } }]);
  });

  it('does not write any vectors when storage headroom is not verified', async () => {
    const upsert = vi.fn();
    const index = { query: vi.fn(), queryById: vi.fn(), upsert } as unknown as VectorizeIndexLike;
    const vectors = createRepoVectorStore(index, {
      ...testBudget(),
      denyStorageGrowth: denyVectorizeStorageGrowth,
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
});
