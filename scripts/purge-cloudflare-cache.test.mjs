import { describe, expect, it, vi } from 'vitest';

import { buildPurgeRequest, purgeCloudflareCache } from './purge-cloudflare-cache.mjs';

describe('Cloudflare cache purge', () => {
  it('limits purges to the Starboard hostname', () => {
    expect(
      buildPurgeRequest({
        zoneId: 'c1e6464302240c22f727ce64262136fe',
        hostname: 'starboard.codevetter.com',
      })
    ).toEqual({
      url: 'https://api.cloudflare.com/client/v4/zones/c1e6464302240c22f727ce64262136fe/purge_cache',
      body: { hosts: ['starboard.codevetter.com'] },
    });

    expect(() =>
      buildPurgeRequest({
        zoneId: 'c1e6464302240c22f727ce64262136fe',
        hostname: 'codevetter.com',
      })
    ).toThrow('Refusing to purge unexpected hostname');
  });

  it('uses the scoped hostname purge API without exposing the token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true }),
    });

    await expect(
      purgeCloudflareCache({
        token: 'test-token',
        zoneId: 'c1e6464302240c22f727ce64262136fe',
        hostname: 'starboard.codevetter.com',
        fetchImpl,
      })
    ).resolves.toBe('starboard.codevetter.com');

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/zones/c1e6464302240c22f727ce64262136fe/purge_cache',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ hosts: ['starboard.codevetter.com'] }),
      })
    );
  });
});
