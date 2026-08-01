import { describe, expect, it, vi } from 'vitest';

import { createVectorizeRestWriter } from './repo-vectors-rest';

describe('Vectorize REST operator writer', () => {
  it('uploads newline-delimited vectors with stable repo ids', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ success: true }));
    const writer = createVectorizeRestWriter({
      accountId: 'account',
      indexName: 'starboard-repos',
      apiToken: 'token',
      fetchImpl,
    });

    await writer.upsert([{ repoId: 42, values: [0.1, 0.2] }]);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account/vectorize/v2/indexes/starboard-repos/upsert?unparsable-behavior=error',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: '42', values: [0.1, 0.2], metadata: { repoId: 42 } }),
      })
    );
  });
});
