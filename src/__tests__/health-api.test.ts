import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  getCloudflareContext: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: { execute: mocks.execute },
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.getCloudflareContext,
}));

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCloudflareContext.mockReturnValue({ env: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('probes the real lexical-search capability', async () => {
    mocks.execute.mockResolvedValue({ rows: [] });

    const response = await GET();
    const payload = (await response.json()) as {
      ok: boolean;
      indexing: { search_probe: boolean };
      surfaces: { search: string; landing: string };
    };

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith({
      sql: expect.stringContaining('repos_fts MATCH ?'),
      args: ['starboard_health_probe'],
    });
    expect(payload.ok).toBe(true);
    expect(payload.indexing.search_probe).toBe(true);
    expect(payload.surfaces.search).toBe('ok');
    expect(payload.surfaces.landing).toBe('unverified');
  });

  it('returns 503 with a sanitized public error when search is unavailable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.execute.mockRejectedValue(
      new Error('libsql failed for https://private.example?token=operator-secret')
    );

    const response = await GET();
    const payload = (await response.json()) as {
      ok: boolean;
      errors: { search: string };
      surfaces: { search: string };
    };
    const publicBody = JSON.stringify(payload);

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(false);
    expect(payload.errors.search).toBe('search_capability_unavailable');
    expect(payload.surfaces.search).toBe('unavailable');
    expect(publicBody).not.toContain('private.example');
    expect(publicBody).not.toContain('operator-secret');
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('does not report configured RAG as semantic-ready when the Vectorize month is unverified', async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    vi.stubEnv('RAG_SERVICE_KEY', 'private-rag-key');
    vi.stubEnv('STARBOARD_RAG_INDEX_ID', 'private-index-id');
    vi.stubEnv('STARBOARD_KNOWLEDGE_PIPELINE', '');
    const fetch = vi.fn(async () =>
      Response.json({ error: 'Verified monthly Vectorize baseline unavailable' }, { status: 503 })
    );
    const namespace = {
      idFromName: vi.fn(() => 'private-object-id'),
      get: vi.fn(() => ({ fetch })),
    };
    mocks.getCloudflareContext.mockReturnValue({ env: { NEURON_BUDGET: namespace } });

    const response = await GET();
    const payload = (await response.json()) as {
      ok: boolean;
      rag_configured: boolean;
      components: { vector_budget: string };
      surfaces: { rag: string; semantic: string };
    };
    const publicBody = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.rag_configured).toBe(true);
    expect(payload.surfaces.rag).toBe('ok');
    expect(payload.surfaces.semantic).toBe('unavailable');
    expect(payload.components.vector_budget).toBe('unavailable');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'https://internal.local/vectorize-usage',
      expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) })
    );
    expect(publicBody).not.toContain('private-rag-key');
    expect(publicBody).not.toContain('private-index-id');
    expect(publicBody).not.toContain('private-object-id');
    expect(publicBody).not.toContain('Verified monthly Vectorize baseline unavailable');
  });

  it('marks semantic retrieval unverified when the verified query ledger has headroom', async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    vi.stubEnv('RAG_SERVICE_KEY', '');
    vi.stubEnv('STARBOARD_RAG_INDEX_ID', '');
    vi.stubEnv('STARBOARD_KNOWLEDGE_PIPELINE', '');
    const monthKey = new Date().toISOString().slice(0, 7);
    const fetch = vi.fn(async () =>
      Response.json({
        monthKey,
        query: {
          state: 'available',
          baselineVerified: true,
          used: 44_999_000,
          remaining: 1_000,
          cap: 45_000_000,
        },
      })
    );
    const namespace = { idFromName: vi.fn(() => 'id'), get: vi.fn(() => ({ fetch })) };
    mocks.getCloudflareContext.mockReturnValue({ env: { NEURON_BUDGET: namespace } });

    const response = await GET();
    const payload = (await response.json()) as {
      rag_configured: boolean;
      components: { vector_budget: string };
      surfaces: { rag: string; semantic: string };
    };

    expect(payload.rag_configured).toBe(false);
    expect(payload.surfaces.rag).toBe('fallback');
    expect(payload.components.vector_budget).toBe('available');
    expect(payload.surfaces.semantic).toBe('unverified');
    expect(JSON.stringify(payload)).not.toMatch(/44_?999_?000|1_?000|45_?000_?000/);
  });

  it('keeps Knowledgebase retrieval unverified when its separate path is enabled', async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    vi.stubEnv('STARBOARD_KNOWLEDGE_PIPELINE', 'knowledgebase');
    const fetch = vi.fn(async () =>
      Response.json({ error: 'Verified monthly Vectorize baseline unavailable' }, { status: 503 })
    );
    const namespace = { idFromName: vi.fn(() => 'id'), get: vi.fn(() => ({ fetch })) };
    mocks.getCloudflareContext.mockReturnValue({ env: { NEURON_BUDGET: namespace } });

    const response = await GET();
    const payload = (await response.json()) as {
      components: { vector_budget: string };
      surfaces: { semantic: string };
    };

    expect(payload.components.vector_budget).toBe('unavailable');
    expect(payload.surfaces.semantic).toBe('unverified');
  });

  it.each([
    ['less than one query of headroom', 44_999_233, 767],
    ['no headroom', 45_000_000, 0],
  ])(
    'does not label an exhausted Vectorize ledger available: %s',
    async (_label, used, remaining) => {
      mocks.execute.mockResolvedValue({ rows: [] });
      const fetch = vi.fn(async () =>
        Response.json({
          monthKey: new Date().toISOString().slice(0, 7),
          query: {
            state: 'available',
            baselineVerified: true,
            used,
            remaining,
            cap: 45_000_000,
          },
        })
      );
      const namespace = { idFromName: vi.fn(() => 'id'), get: vi.fn(() => ({ fetch })) };
      vi.stubEnv('STARBOARD_KNOWLEDGE_PIPELINE', '');
      mocks.getCloudflareContext.mockReturnValue({ env: { NEURON_BUDGET: namespace } });

      const response = await GET();
      const payload = (await response.json()) as {
        components: { vector_budget: string };
        surfaces: { semantic: string };
      };

      expect(payload.components.vector_budget).toBe('insufficient_headroom');
      expect(payload.surfaces.semantic).toBe('unavailable');
    }
  );

  it('fails closed for stale or malformed Vectorize status without exposing provider fields', async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    vi.stubEnv('STARBOARD_KNOWLEDGE_PIPELINE', '');
    const fetch = vi.fn(async () =>
      Response.json({
        monthKey: '2026-10',
        query: {
          state: 'available',
          baselineVerified: false,
          used: 0,
          remaining: 45_000_000,
          cap: 45_000_000,
          accountId: 'private-account-id',
        },
      })
    );
    const namespace = { idFromName: vi.fn(() => 'id'), get: vi.fn(() => ({ fetch })) };
    mocks.getCloudflareContext.mockReturnValue({ env: { NEURON_BUDGET: namespace } });

    const response = await GET();
    const payload = (await response.json()) as {
      components: { vector_budget: string };
      surfaces: { semantic: string };
    };

    expect(payload.components.vector_budget).toBe('unavailable');
    expect(payload.surfaces.semantic).toBe('unavailable');
    expect(JSON.stringify(payload)).not.toContain('private-account-id');
    expect(JSON.stringify(payload)).not.toContain('45_000_000');
  });

  it('bounds a stalled Vectorize status read and aborts it without changing health HTTP semantics', async () => {
    vi.useFakeTimers();
    mocks.execute.mockResolvedValue({ rows: [] });
    vi.stubEnv('STARBOARD_KNOWLEDGE_PIPELINE', '');
    let requestSignal: AbortSignal | undefined;
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    const namespace = { idFromName: vi.fn(() => 'id'), get: vi.fn(() => ({ fetch })) };
    mocks.getCloudflareContext.mockReturnValue({ env: { NEURON_BUDGET: namespace } });

    try {
      const responsePromise = GET();
      await vi.advanceTimersByTimeAsync(500);
      const response = await responsePromise;
      const payload = (await response.json()) as {
        ok: boolean;
        components: { vector_budget: string };
        surfaces: { semantic: string };
      };

      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.components.vector_budget).toBe('unavailable');
      expect(payload.surfaces.semantic).toBe('unavailable');
      expect(requestSignal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
