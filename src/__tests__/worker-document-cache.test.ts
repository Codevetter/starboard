import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openNextStub } from './fixtures/open-next-worker-stub.mjs';
import worker from '../../worker.mjs';

const entries = new Map<string, Response>();
const match = vi.fn(async (request: Request) => entries.get(request.url)?.clone());
const put = vi.fn(async (request: Request, response: Response) => {
  entries.set(request.url, response.clone());
});
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
const env = { CF_VERSION_METADATA: { id: 'cache-regression-v1' } };
const html = (body: string, headers: Record<string, string> = {}, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html', ...headers } });
const fetchDocument = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  worker.fetch(new Request(`https://starboard.example${path}`, { headers, method }), env, ctx);

beforeEach(() => {
  entries.clear();
  pending.length = 0;
  match.mockClear();
  put.mockClear();
  openNextStub.reset();
  vi.stubGlobal('caches', { default: { match, put } });
});
afterEach(() => vi.unstubAllGlobals());

describe('generated Worker document cache boundary', () => {
  it('matches the existing generator template', () => {
    expect(readFileSync('worker.mjs', 'utf8')).toBe(
      readFileSync('scripts/templates/worker.mjs', 'utf8')
    );
  });

  it.each(['/projects', '/projects/acme/app', '/stars', '/login'])(
    'never reads or writes public cache for protected %s, even with a stale entry',
    async (path) => {
      entries.set(
        `https://starboard.example${path}?__starboard_worker_version=cache-regression-v1`,
        html('protected stale content', { 'cache-control': 'public, max-age=86400' })
      );
      openNextStub.handler = () =>
        html('guest sign-in shell', {
          'cache-control': 'private, no-store, max-age=0',
        });
      const response = await fetchDocument(path);
      expect(await response.text()).toBe('guest sign-in shell');
      expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(response.headers.has('x-edge-cache')).toBe(false);
      expect(openNextStub.calls).toEqual([path]);
      expect(match).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
    }
  );

  it.each([
    'authjs.session-token=fixture',
    '__Secure-authjs.session-token=fixture',
    'authjs.session-token.0=fixture; authjs.session-token.1=fixture',
    '__Secure-authjs.session-token.1=fixture',
    'next-auth.session-token=fixture',
    '__Secure-next-auth.session-token.0=fixture',
    'better-auth.session_token=fixture',
  ])('bypasses public cache for session cookie %s', async (cookie) => {
    openNextStub.handler = () => html('anonymous catalog');
    await fetchDocument('/discover');
    await Promise.all(pending);
    match.mockClear();
    put.mockClear();
    openNextStub.handler = () =>
      html('signed-in document', { 'cache-control': 'private, no-store' });
    const response = await fetchDocument('/discover', { cookie });
    expect(await response.text()).toBe('signed-in document');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(await (await fetchDocument('/discover')).text()).toBe('anonymous catalog');
  });

  it('bypasses the landing asset shortcut for a secure chunked session', async () => {
    openNextStub.handler = () => html('session document', { 'cache-control': 'private, no-store' });
    const assets = vi.fn(() => html('public asset'));
    const response = await worker.fetch(
      new Request('https://starboard.example/', {
        headers: { cookie: '__Secure-authjs.session-token.0=fixture' },
      }),
      { ...env, ASSETS: { fetch: assets } },
      ctx
    );
    expect(await response.text()).toBe('session document');
    expect(assets).not.toHaveBeenCalled();
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it.each(['/', '/discover', '/tools'])(
    'bypasses assets and public cache with Authorization on %s',
    async (path) => {
      openNextStub.handler = () =>
        html('authorized document', { 'cache-control': 'private, no-store' });
      const assets = vi.fn(() => html('public asset'));
      const response = await worker.fetch(
        new Request(`https://starboard.example${path}`, {
          headers: { authorization: 'Bearer fixture' },
        }),
        { ...env, ASSETS: { fetch: assets } },
        ctx
      );
      expect(await response.text()).toBe('authorized document');
      expect(assets).not.toHaveBeenCalled();
      expect(match).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
    }
  );

  it.each([
    { headers: { 'cache-control': 'private, max-age=0' }, status: 200 },
    { headers: { 'cache-control': 'no-store' }, status: 200 },
    { headers: { 'cache-control': 'no-cache' }, status: 200 },
    { headers: { 'set-cookie': 'authjs.session-token=fixture; HttpOnly' }, status: 200 },
    { headers: { location: '/login' }, status: 302 },
    { headers: {}, status: 404 },
    { headers: { 'content-type': 'text/x-component' }, status: 200 },
  ])('preserves upstream non-cacheable response %j', async ({ headers, status }) => {
    openNextStub.handler = () => html('upstream response', headers, status);
    const response = await fetchDocument('/discover');
    expect(response.status).toBe(status);
    for (const [name, value] of Object.entries(headers))
      expect(response.headers.get(name)).toBe(value);
    expect(await response.text()).toBe('upstream response');
    expect(response.headers.has('x-edge-cache')).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });

  it('preserves anonymous public caching and separates deployment versions', async () => {
    openNextStub.handler = () => html('public catalog');
    const first = await fetchDocument('/discover', { cookie: 'theme=dark' });
    expect(first.headers.get('x-edge-cache')).toBe('MISS');
    expect(first.headers.get('cache-control')).toContain('s-maxage=86400');
    expect(await first.text()).toBe('public catalog');
    await Promise.all(pending);
    expect((await fetchDocument('/discover')).headers.get('x-edge-cache')).toBe('HIT');
    expect(openNextStub.calls).toEqual(['/discover']);
    const nextVersion = await worker.fetch(
      new Request('https://starboard.example/discover'),
      {
        CF_VERSION_METADATA: { id: 'cache-regression-v2' },
      },
      ctx
    );
    expect(nextVersion.headers.get('x-edge-cache')).toBe('MISS');
    expect(openNextStub.calls).toEqual(['/discover', '/discover']);
  });

  it.each(['POST', 'HEAD'])('does not cache %s requests', async (method) => {
    openNextStub.handler = () => html('upstream');
    await fetchDocument('/discover', {}, method);
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
