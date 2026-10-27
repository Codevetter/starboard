import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handlePublicReadability,
  publicDiscoveryHeaders,
} from '../src/edge/public-readability.mjs';
import { STATIC_PAGES, STATIC_ROUTES } from '../src/edge/public-static.mjs';
const origin = 'https://starboard.codevetter.com';
const publicRequest = (url, init = {}) =>
  new Request(url, {
    ...init,
    headers: { 'User-Agent': 'GPTBot', ...Object.fromEntries(new Headers(init.headers)) },
  });
test('all authored static sources provide equivalent forms and protocol headers', async () => {
  for (const route of STATIC_ROUTES) {
    const bodies = [];
    for (const [path, headers] of [
      [route.path === '/' ? '/index.md' : `${route.path}.md`, {}],
      [`/api/md${route.path === '/' ? '' : route.path}`, {}],
      [route.path, { Accept: 'text/markdown' }],
    ]) {
      const response = await handlePublicReadability(
        publicRequest(origin + path, { headers }),
        () => {
          throw new Error('Static source unexpectedly fetched');
        }
      );
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), /text\/markdown/);
      assert.equal(response.headers.get('access-control-allow-origin'), '*');
      assert.match(response.headers.get('x-robots-tag'), /noindex/);
      assert.equal(response.headers.get('content-location'), origin + route.path);
      bodies.push(await response.text());
    }
    assert.equal(bodies[0], bodies[1]);
    assert.equal(bodies[1], bodies[2]);
    assert.equal(bodies[0], STATIC_PAGES[route.path]);
  }
});
test('dynamic source receives no credentials or query, private source remains unreachable', async () => {
  let calls = 0;
  const render = async (request) => {
    calls++;
    assert.equal(new URL(request.url).pathname, '/api/public-markdown/explore/acme/example');
    assert.equal(new URL(request.url).search, '');
    for (const header of ['cookie', 'authorization'])
      assert.equal(request.headers.get(header), null);
    return Response.json({
      path: '/explore/acme/example',
      markdown: `# Example\n\nCanonical: ${origin}/explore/acme/example\n`,
    });
  };
  const r = await handlePublicReadability(
    publicRequest(`${origin}/explore/acme/example.md?private=secret`, {
      headers: { Cookie: 'private=secret', Authorization: 'Bearer secret' },
    }),
    render
  );
  assert.equal(r.status, 200);
  assert.equal(calls, 1);
  for (const path of ['/api/md/projects', '/api/md/stars', '/api/md/admin', '/missing.md']) {
    const r = await handlePublicReadability(publicRequest(origin + path), render);
    assert.equal(r.status, 404, path);
  }
  assert.equal(calls, 1);
  assert.equal(
    await handlePublicReadability(
      publicRequest(`${origin}/api/tools`, { headers: { Accept: 'text/markdown' } }),
      render
    ),
    null
  );
});
test('HEAD, OPTIONS, quality negotiation and missing source behavior', async () => {
  const head = await handlePublicReadability(
    publicRequest(`${origin}/index.md`, { method: 'HEAD' }),
    () => {}
  );
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const options = await handlePublicReadability(
    publicRequest(`${origin}/api/md/about`, { method: 'OPTIONS' }),
    () => {}
  );
  assert.equal(options.status, 204);
  assert.equal(
    await handlePublicReadability(
      publicRequest(`${origin}/`, {
        headers: { Accept: 'text/html;q=1,text/markdown;q=0.5', 'User-Agent': 'GPTBot' },
      }),
      () => {}
    ),
    null
  );
  const missing = await handlePublicReadability(
    publicRequest(`${origin}/about.md`),
    () => new Response('', { status: 404 })
  );
  assert.equal(missing.status, 404);
  const failed = await handlePublicReadability(
    publicRequest(`${origin}/about.md`),
    () => new Response('', { status: 500 })
  );
  assert.equal(failed.status, 503);
  assert.match(failed.headers.get('cache-control'), /no-store/);
});

test('source bridge rejects RSC state before Next normalization and aliases retain canonical identity', async () => {
  const denied = await handlePublicReadability(
    publicRequest(`${origin}/api/public-markdown/about`, { headers: { RSC: '1' } }),
    () => {
      throw new Error('must not invoke source');
    }
  );
  assert.equal(denied.status, 404);
  const response = await handlePublicReadability(
    publicRequest(`${origin}/api/md/explore/ACME/EXAMPLE`),
    () =>
      Response.json({
        path: '/explore/acme/example',
        title: 'Example',
        description: 'Public repository',
        markdown: `# Example\n\nCanonical: ${origin}/explore/acme/example\n`,
      })
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-location'), `${origin}/explore/acme/example`);
});

test('landing head rewriting decodes manual gzip before automatic transport encoding', async () => {
  const original = globalThis.HTMLRewriter;
  let input;
  globalThis.HTMLRewriter = class {
    on() {
      return this;
    }
    transform(response) {
      input = response.text();
      return new Response(
        new ReadableStream({
          async start(controller) {
            controller.enqueue(new TextEncoder().encode(await input));
            controller.close();
          },
        }),
        response
      );
    }
  };
  try {
    const html = '<!doctype html><html><head></head><body>Authored homepage</body></html>';
    const compressed = new Response(html).body.pipeThrough(new CompressionStream('gzip'));
    const result = publicDiscoveryHeaders(
      publicRequest(`${origin}/`),
      new Response(compressed, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Encoding': 'gzip',
          'x-edge-cache': 'ASSET',
        },
      })
    );
    assert.equal(await input, html);
    assert.equal(result.headers.get('content-encoding'), 'gzip');
    assert.equal(await result.text(), html);
  } finally {
    if (original) globalThis.HTMLRewriter = original;
    else delete globalThis.HTMLRewriter;
  }
});

test('public Markdown preserves the existing explore scraper guard and browser .md repository pages', async () => {
  const load = () => {
    throw new Error('Blocked source must not be read');
  };
  for (const path of [
    '/explore/acme/repo.md',
    '/api/md/explore/acme/repo',
    '/explore/acme/repo',
    '/api/public-markdown/explore/acme/repo',
  ]) {
    for (const agent of ['curl/8.0', 'Lightpanda/1.0']) {
      const response = await handlePublicReadability(
        new Request(origin + path, { headers: { 'User-Agent': agent, Accept: 'text/markdown' } }),
        load
      );
      assert.equal(response.status, 403, path);
    }
  }
  for (const headers of [{ Accept: 'text/html' }, { RSC: '1' }]) {
    const response = await handlePublicReadability(
      publicRequest(`${origin}/explore/acme/notes.md`, { headers }),
      load
    );
    assert.equal(response, null);
  }
  const robots = await (
    await handlePublicReadability(publicRequest(`${origin}/robots.txt`), load)
  ).text();
  assert.equal(robots.match(/Allow: \/api\/ai/g).length, 7);
});
