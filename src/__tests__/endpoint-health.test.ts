import { describe, expect, it, vi } from 'vitest';
import {
  createAppHealthClient,
  type AppHealthClient,
  type AppHealthClientOptions,
} from '@saas-maker/app-health';

import { createEndpointHealthRecorder } from '../../endpoint-health.mjs';
import { withTiming } from '../../timing.mjs';

describe('optional API endpoint health', () => {
  it('does not initialize or send when the private key is absent', () => {
    const createClient = vi.fn();
    const observe = createEndpointHealthRecorder(createClient);
    const waitUntil = vi.fn();

    observe(
      new Request('https://starboard.example/api/repos/123?token=private'),
      200,
      8,
      {},
      { waitUntil }
    );

    expect(createClient).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('records a safe normalized route template and approved endpoint fields', async () => {
    const events: unknown[] = [];
    const createClient = vi.fn(
      () =>
        ({
          record: (event: unknown) => events.push(event),
          flush: async () => undefined,
        }) as unknown as AppHealthClient
    );
    const observe = createEndpointHealthRecorder(createClient);
    let delivery: Promise<unknown> | undefined;
    const env = {
      APP_HEALTH_INGEST_KEY: 'synthetic-test-key',
      APP_HEALTH_ENVIRONMENT: 'staging',
    };

    observe(
      new Request('https://starboard.example/api/repos/private-repo-id?token=private'),
      503,
      12.4,
      env,
      {
        waitUntil: (promise: Promise<unknown>) => {
          delivery = promise;
        },
      }
    );
    await delivery;

    expect(createClient).toHaveBeenCalledWith({
      key: 'synthetic-test-key',
      environment: 'staging',
      endpoint: 'https://ingest.sassmaker.com/v1/ingest',
      runtime: 'worker',
      disableTimer: true,
      maxQueueSize: 100,
      maxBatchSize: 20,
      requestTimeoutMs: 5_000,
      maxRetries: 1,
    });
    expect(events).toEqual([
      {
        method: 'GET',
        route: '/api/repos/:repoId',
        status_code: 503,
        duration_ms: 12,
      },
    ]);
  });

  it('accepts an ingest response that takes longer than one second without retrying', async () => {
    let client: AppHealthClient | undefined;
    const createClient = (options: AppHealthClientOptions) => {
      client = createAppHealthClient({
        ...options,
        fetch: (_input, init) =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(() => resolve({ status: 202 }), 1_500);
            init.signal?.addEventListener(
              'abort',
              () => {
                clearTimeout(timeout);
                reject(init.signal?.reason ?? new Error('request aborted'));
              },
              { once: true }
            );
          }),
      });
      return client;
    };
    const observe = createEndpointHealthRecorder(createClient);
    let delivery: Promise<unknown> | undefined;

    observe(
      new Request('https://starboard.example/api/health'),
      200,
      8,
      { APP_HEALTH_INGEST_KEY: 'synthetic-test-key' },
      {
        waitUntil: (promise: Promise<unknown>) => {
          delivery = promise;
        },
      }
    );
    await delivery;

    expect(client?.diagnostics()).toMatchObject({
      sentBatches: 1,
      sentEvents: 1,
      retriedBatches: 0,
      failedBatches: 0,
      droppedDelivery: 0,
    });
  });

  it('uses the generic group for unknown API paths without forwarding path or query values', async () => {
    const events: unknown[] = [];
    const observe = createEndpointHealthRecorder(
      () =>
        ({
          record: (event: unknown) => events.push(event),
          flush: async () => undefined,
        }) as unknown as AppHealthClient
    );
    let delivery: Promise<unknown> | undefined;

    observe(
      new Request('https://starboard.example/api/private-customer/secret-id?email=private'),
      200,
      3,
      { APP_HEALTH_INGEST_KEY: 'synthetic-test-key' },
      {
        waitUntil: (promise: Promise<unknown>) => {
          delivery = promise;
        },
      }
    );
    await delivery;

    expect(events).toEqual([
      { method: 'GET', route: '/api/:route', status_code: 200, duration_ms: 3 },
    ]);
  });

  it('leaves non-API requests outside endpoint monitoring', () => {
    const createClient = vi.fn();
    const observe = createEndpointHealthRecorder(createClient);

    observe(
      new Request('https://starboard.example/projects/private-slug?token=private'),
      200,
      5,
      { APP_HEALTH_INGEST_KEY: 'synthetic-test-key' },
      { waitUntil: vi.fn() }
    );

    expect(createClient).not.toHaveBeenCalled();
  });

  it('does not delay or change a response when ingest fails', async () => {
    const createClient = vi.fn(
      () =>
        ({
          record: vi.fn(),
          flush: () => Promise.reject(new Error('collector unavailable')),
        }) as unknown as AppHealthClient
    );
    const observe = createEndpointHealthRecorder(createClient);
    let delivery: Promise<unknown> | undefined;

    const response = await withTiming(async () => new Response('ok', { status: 200 }), observe)(
      new Request('https://starboard.example/api/repos/123?token=private'),
      { APP_HEALTH_INGEST_KEY: 'synthetic-test-key' },
      {
        waitUntil: (promise: Promise<unknown>) => {
          delivery = promise;
        },
      }
    );
    await delivery;

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('preserves the response and records thrown handlers as 500 before rethrowing', async () => {
    const observations: Array<{ status: number; durationMs: number }> = [];
    const observe = (_request: Request, status: number, durationMs: number) => {
      observations.push({ status, durationMs });
    };
    const response = await withTiming(
      async () => new Response('unchanged', { status: 201, headers: { 'x-test': 'kept' } }),
      observe
    )(new Request('https://starboard.example/api/stars/sync?cursor=private'), {}, undefined);

    expect(response.status).toBe(201);
    expect(response.headers.get('x-test')).toBe('kept');
    expect(response.headers.get('server-timing')).toMatch(/^app;dur=\d+$/);
    expect(await response.text()).toBe('unchanged');

    const failure = new Error('handler failure');
    await expect(
      withTiming(async () => {
        throw failure;
      }, observe)(new Request('https://starboard.example/api/stars'), {}, undefined)
    ).rejects.toBe(failure);
    expect(observations).toHaveLength(2);
    expect(observations[0]?.status).toBe(201);
    expect(observations[1]?.status).toBe(500);
  });
});
