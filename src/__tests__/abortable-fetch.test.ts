import { describe, expect, it, vi } from 'vitest';

import { replaceAbortableJsonRequest } from '@/lib/abortable-fetch';

describe('replaceAbortableJsonRequest', () => {
  it('aborts only the stale request and leaves the newest request alive', async () => {
    const pending: Array<{
      signal: AbortSignal;
      resolve: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((resolve) => pending.push({ signal: init!.signal as AbortSignal, resolve }))
      )
    );
    const ref = { current: null as AbortController | null };

    const first = replaceAbortableJsonRequest(ref, '/first');
    const second = replaceAbortableJsonRequest<{ page: number }>(ref, '/second');

    expect(pending[0].signal.aborted).toBe(true);
    expect(pending[1].signal.aborted).toBe(false);

    pending[1].resolve({ ok: true, json: async () => ({ page: 2 }) });
    await expect(second).resolves.toEqual({ page: 2 });
    expect(ref.current).toBeNull();

    pending[0].resolve({ ok: true, json: async () => ({ page: 1 }) });
    await expect(first).resolves.toEqual({ page: 1 });
  });
});
