import { describe, expect, it, vi } from 'vitest';

import { createVectorizeRestWriter } from './repo-vectors-rest';
import { runOnlyIfVectorizeStorageGrowthAllowed } from './shared-ai-budget';

describe('Vectorize REST operator writer', () => {
  it('blocks storage writes before sending a REST request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ success: true }));
    const writer = createVectorizeRestWriter({
      accountId: 'account',
      indexName: 'starboard-repos',
      apiToken: 'token',
      fetchImpl,
    });

    await expect(writer.upsert([{ repoId: 42, values: Array(768).fill(0) }])).rejects.toThrow(
      /storage growth is disabled/
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks scheduled embeddings before invoking the paid provider', async () => {
    const generate = vi.fn().mockResolvedValue([[0.1]]);

    await expect(runOnlyIfVectorizeStorageGrowthAllowed(generate)).rejects.toThrow(
      /storage growth is disabled/
    );
    expect(generate).not.toHaveBeenCalled();
  });
});
