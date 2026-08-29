/**
 * Regression guard for the edge shadowing real API routes.
 *
 * Commit 4c67733 gave `agent-edge.mjs` a `path.startsWith('/api/')` catch-all
 * that answered 404 *before* OpenNext ever saw the request, with only
 * `/api/ai` allow-listed above it. Every other `GET /api/*` — Discover, health,
 * tools, the whole NextAuth surface — was 404'd at the edge in production for
 * six days.
 *
 * These tests drive the real `worker.mjs` entrypoint with a stubbed OpenNext
 * handler (see `fixtures/open-next-worker-stub.mjs`), so they cover the actual
 * wiring, not a reimplementation of it.
 *
 * The route list is read off the filesystem rather than hard-coded: a route
 * handler added under `src/app/api/` is covered the moment it lands, which is
 * exactly the rot that the original hand-maintained allow-list suffered.
 */
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { openNextStub } from './fixtures/open-next-worker-stub.mjs';
import worker from '../../worker.mjs';

const API_DIR = resolve(__dirname, '../app/api');

/** Turn `src/app/api/repos/[repoId]/route.ts` into a concrete `/api/repos/sample`. */
function collectApiRoutePaths(dir: string, prefix = '/api'): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith('[')
        ? // Dynamic and catch-all segments get a concrete stand-in value.
          entry.name.startsWith('[...') || entry.name.startsWith('[[...')
          ? 'sample/segment'
          : 'sample'
        : entry.name;
      paths.push(...collectApiRoutePaths(join(dir, entry.name), `${prefix}/${segment}`));
    } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
      paths.push(prefix);
    }
  }
  return paths;
}

const API_ROUTE_PATHS = collectApiRoutePaths(API_DIR);

const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined };
const env = {} as Record<string, unknown>;

function get(path: string, headers: Record<string, string> = {}) {
  return worker.fetch(
    new Request(`https://starboard.codevetter.com${path}`, { headers }),
    env,
    ctx
  );
}

beforeEach(() => {
  openNextStub.reset();
});

describe('edge does not shadow Next.js API routes', () => {
  it('found the route handlers to guard', () => {
    // Sanity check: if this ever hits zero the suite below is vacuous.
    expect(API_ROUTE_PATHS.length).toBeGreaterThan(20);
    expect(API_ROUTE_PATHS).toContain('/api/discover');
    expect(API_ROUTE_PATHS).toContain('/api/health');
  });

  it('reaches a real API route through the edge on GET', async () => {
    openNextStub.handler = () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const response = await get('/api/discover');

    expect(openNextStub.calls).toEqual(['/api/discover']);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it.each(API_ROUTE_PATHS)('lets GET %s reach Next.js', async (path) => {
    openNextStub.handler = () => new Response('routed', { status: 200 });

    const response = await get(path);

    expect(openNextStub.calls).toEqual([path]);
    expect(response.status).toBe(200);
  });

  it('does not let an Accept header divert an API route to the markdown 404', async () => {
    openNextStub.handler = () => new Response('routed', { status: 200 });

    const response = await get('/api/discover', { accept: 'text/markdown' });

    expect(openNextStub.calls).toEqual(['/api/discover']);
    expect(response.status).toBe(200);
  });
});

describe('unknown API paths still answer with the JSON 404 envelope', () => {
  it('replaces the Next.js HTML 404 with JSON', async () => {
    openNextStub.handler = () =>
      new Response('<!DOCTYPE html><html><body>404</body></html>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });

    const response = await get('/api/definitely-not-a-real-path');

    expect(openNextStub.calls).toEqual(['/api/definitely-not-a-real-path']);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      error: {
        code: 'not_found',
        message: 'Unknown API path: /api/definitely-not-a-real-path',
        path: '/api/definitely-not-a-real-path',
      },
    });
  });

  it("leaves a route handler's own 404 JSON body untouched", async () => {
    openNextStub.handler = () =>
      new Response(JSON.stringify({ error: 'repo not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });

    const response = await get('/api/repos/999999');

    expect(await response.json()).toEqual({ error: 'repo not found' });
  });

  it('leaves non-API 404s alone so the HTML error page still renders', async () => {
    openNextStub.handler = () =>
      new Response('<!DOCTYPE html><html><body>404</body></html>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });

    // Deliberately not a cacheable document path — the edge HTML cache branch
    // needs `caches.default`, which only exists in workerd.
    const response = await get('/no-such-page');

    expect(openNextStub.calls).toEqual(['/no-such-page']);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('text/html');
  });
});

describe('edge-owned surfaces still work', () => {
  it('serves the agent catalog at /api/ai without touching Next.js', async () => {
    const response = await get('/api/ai');

    expect(openNextStub.calls).toEqual([]);
    expect(response.status).toBe(200);
    const catalog = (await response.json()) as { name: string; openapi: string };
    expect(catalog.name).toBe('Starboard');
    expect(catalog.openapi).toBe('https://starboard.codevetter.com/openapi.json');
  });

  it('serves the OpenAPI spec', async () => {
    const response = await get('/openapi.json');

    expect(openNextStub.calls).toEqual([]);
    expect(response.status).toBe(200);
    const spec = (await response.json()) as { openapi: string };
    expect(spec.openapi).toBe('3.1.0');
  });

  it('serves llms.txt and index.md', async () => {
    expect((await get('/llms.txt')).status).toBe(200);
    expect((await get('/index.md')).status).toBe(200);
    expect(openNextStub.calls).toEqual([]);
  });

  it('still negotiates markdown on the homepage', async () => {
    const response = await get('/', { accept: 'text/markdown' });

    expect(openNextStub.calls).toEqual([]);
    expect(response.headers.get('content-type')).toContain('text/markdown');
  });

  it('still serves the markdown 404 for unknown non-API pages', async () => {
    const response = await get('/no-such-page', { accept: 'text/markdown' });

    expect(openNextStub.calls).toEqual([]);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('text/markdown');
  });
});
