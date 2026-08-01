import { describe, expect, it, vi } from 'vitest';

import { createRepoVectorStore, type VectorizeIndexLike } from './repo-vectors';

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

    const matches = await createRepoVectorStore(index).query([0.1, 0.2], 20);
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

    await createRepoVectorStore(index).upsert([{ repoId: 7, values: [0.2, 0.3] }]);

    expect(upsert).toHaveBeenCalledWith([{ id: '7', values: [0.2, 0.3], metadata: { repoId: 7 } }]);
  });

  it('caps queries at the current Vectorize topK limit', async () => {
    const query = vi.fn().mockResolvedValue({ matches: [] });
    const index = {
      query,
      queryById: vi.fn(),
      upsert: vi.fn(),
    } as unknown as VectorizeIndexLike;

    await createRepoVectorStore(index).query([0.1, 0.2], 200);

    expect(query).toHaveBeenCalledWith([0.1, 0.2], {
      topK: 100,
      returnValues: false,
      returnMetadata: 'none',
    });
  });
});
