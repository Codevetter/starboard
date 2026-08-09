import { describe, expect, it, vi } from 'vitest';

import { FetchHttpError, jsonFetcher, swrErrorRetry } from '@/lib/swr-fetcher';

describe('jsonFetcher', () => {
  it('returns JSON on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      })
    );
    await expect(jsonFetcher<{ ok: boolean }>('/x')).resolves.toEqual({ ok: true });
  });

  it('throws FetchHttpError with Retry-After on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: (name: string) => (name === 'Retry-After' ? '3' : null) },
        json: async () => ({ error: 'Try again shortly.' }),
      })
    );
    await expect(jsonFetcher('/x')).rejects.toMatchObject({
      name: 'FetchHttpError',
      status: 429,
      retryAfterMs: 3000,
      message: 'Try again shortly.',
    });
  });
});

describe('swrErrorRetry', () => {
  it('does not retry 401', () => {
    const revalidate = vi.fn();
    swrErrorRetry(new FetchHttpError(401), '/x', {}, revalidate, { retryCount: 0 });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('schedules a retry for 429', () => {
    vi.useFakeTimers();
    const revalidate = vi.fn();
    swrErrorRetry(new FetchHttpError(429, 1000), '/x', {}, revalidate, { retryCount: 0 });
    expect(revalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revalidate).toHaveBeenCalledWith({ retryCount: 0 });
    vi.useRealTimers();
  });
});
