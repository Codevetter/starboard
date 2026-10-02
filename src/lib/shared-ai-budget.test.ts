import { describe, expect, it, vi } from 'vitest';

import {
  denyVectorizeStorageGrowth,
  estimateWorkersAiNeurons,
  reserveVectorizeQuery,
  reserveWorkersAiCall,
  SharedBudgetDeniedError,
  type SharedBudgetNamespace,
} from './shared-ai-budget';

function makeBudget(response: unknown, status = 200) {
  const requests: Array<{ url: string; body: unknown }> = [];
  const namespace: SharedBudgetNamespace = {
    idFromName: vi.fn((name: string) => name),
    get: vi.fn(() => ({
      fetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return Response.json(response, { status });
      }),
    })),
  };
  return { namespace, requests };
}

describe('shared AI spend guard', () => {
  it('estimates with serialized UTF-8 bytes and rejects unpriced models', () => {
    const input = { text: ['é'] };
    const expected = Math.ceil(
      (Math.ceil(new TextEncoder().encode(JSON.stringify(input)).byteLength * 1.2) * 6_058) /
        1_000_000
    );
    expect(estimateWorkersAiNeurons('@cf/baai/bge-base-en-v1.5', input)).toBe(
      Math.max(1, expected)
    );
    expect(estimateWorkersAiNeurons('@cf/baai/unknown', input)).toBe(0);
  });

  it('requires a strict same-day neuron receipt', async () => {
    const input = { text: ['query'] };
    const neurons = estimateWorkersAiNeurons('@cf/baai/bge-base-en-v1.5', input);
    const { namespace, requests } = makeBudget({
      allowed: true,
      used: neurons,
      remaining: 9_500 - neurons,
      retryAfter: 0,
      dayKey: new Date().toISOString().slice(0, 10),
    });
    await reserveWorkersAiCall(namespace, '@cf/baai/bge-base-en-v1.5', input);
    expect(requests[0]).toEqual({ url: 'https://internal.local/try-debit', body: { neurons } });

    const stale = makeBudget({
      allowed: true,
      used: neurons,
      remaining: 9_500 - neurons,
      retryAfter: 0,
      dayKey: '2000-01-01',
    });
    await expect(
      reserveWorkersAiCall(stale.namespace, '@cf/baai/bge-base-en-v1.5', input)
    ).rejects.toBeInstanceOf(SharedBudgetDeniedError);
  });

  it('requires a verified current-month Vectorize receipt', async () => {
    const { namespace, requests } = makeBudget({
      allowed: true,
      used: 35_000_768,
      remaining: 9_999_232,
      retryAfter: 0,
      monthKey: new Date().toISOString().slice(0, 7),
      baselineVerified: true,
    });
    await reserveVectorizeQuery(namespace, 768);
    expect(requests[0]).toEqual({
      url: 'https://internal.local/try-debit-vectorize',
      body: { dimensions: 768 },
    });

    const unverified = makeBudget({
      allowed: true,
      used: 35_000_768,
      remaining: 9_999_232,
      retryAfter: 0,
      monthKey: new Date().toISOString().slice(0, 7),
      baselineVerified: false,
    });
    await expect(reserveVectorizeQuery(unverified.namespace, 768)).rejects.toBeInstanceOf(
      SharedBudgetDeniedError
    );
  });

  it('blocks stored-vector growth without using the query reservation endpoint', () => {
    expect(denyVectorizeStorageGrowth).toThrowError(SharedBudgetDeniedError);
  });
});
