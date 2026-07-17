// worker.mjs — custom Worker entry that wraps OpenNext with edge cache.
//
// The OpenNext-generated worker (`./.open-next/worker.js`) is imported as
// the inner handler. For GET / requests we consult `caches.default` first
// and only fall through to the Next handler on a miss — eliminating the
// Worker cold-start path entirely for warm-cache hits on the homepage.
//
// Cache headers are explicit so CF Edge actually treats the response as
// cacheable (s-maxage-only was getting marked DYNAMIC at the zone level;
// using caches.default sidesteps the zone-level Cache Rules requirement).
//
// All non-GET, non-`/` requests pass straight through to OpenNext.

import openNext from './.open-next/worker.js';
import { withTiming } from './timing.mjs';
import { handleAgentEdge } from './agent-edge.mjs';

// Durable Objects must be re-exported from the entry that wrangler.toml
// points at, otherwise the bindings can't resolve them at deploy time.
export {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from './.open-next/worker.js';

const CACHEABLE_DOCUMENT_PATHS = new Set([
  '/',
  '/discover',
  '/explore',
  '/tools',
  '/stack-builder',
  '/projects',
  '/radar',
  '/stars',
  '/about',
  '/privacy',
  '/terms',
]);
const CACHEABLE_PREFIXES = ['/tools', '/projects', '/lists', '/reports', '/explore'];
const CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
function isCacheableDocumentPath(pathname) {
  if (CACHEABLE_DOCUMENT_PATHS.has(pathname)) return true;
  for (const prefix of CACHEABLE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

// Skip cache when ANY of these cookies are present — covers the better-auth
// session in both prod (__Secure-) and dev variants so signed-in users
// always see live SSR (e.g. redirect to /library).
const AUTH_COOKIE_FRAGMENTS = ['session_token', 'session-token'];

function hasAuthCookie(request) {
  const cookie = request.headers.get('cookie');
  if (!cookie) return false;
  return AUTH_COOKIE_FRAGMENTS.some((c) => cookie.includes(c));
}

const worker = {
  fetch: withTiming(async function fetch(request, env, ctx) {
    // Agent / LLM indexing surfaces (fleet GEO standard)
    {
      const agent = handleAgentEdge(request);
      if (agent) return agent;
    }
    try {
      if (request.method !== 'GET') {
        return openNext.fetch(request, env, ctx);
      }
      const url = new URL(request.url);
      if (!isCacheableDocumentPath(url.pathname)) {
        return openNext.fetch(request, env, ctx);
      }
      // Auth-bearing requests pass straight through; the user is likely
      // going to be redirected by middleware to /library or /dashboard.
      if (url.pathname === '/' && hasAuthCookie(request)) {
        return openNext.fetch(request, env, ctx);
      }

      // Short-circuit: the Astro landing is overlaid into
      // `.open-next/assets/index.html` by `scripts/overlay-astro-landing.mjs`.
      // For anon GET /, serve straight from the assets binding instead of
      // booting the full OpenNext stack (next-server, middleware handler,
      // Beasties pipeline, etc.). Cuts TTFB from ~250ms to ~30ms.
      //
      // The Workers Static Assets binding does NOT auto-compress its
      // responses (Lighthouse flagged ~80 KB wasted on uncompressed HTML
      // even with CF Edge cache HIT). Compress with gzip here so the
      // response — and the downstream CF Edge cache entry — is small.
      // Only Astro overlay at `/` is static; marketing pages use edge HTML cache.
      if (env.ASSETS && url.pathname === '/') {
        const assetResp = await env.ASSETS.fetch(request);
        // The assets binding answers If-None-Match revalidations with 304.
        // Pass those through — falling through would serve the wrong page.
        if (assetResp.status === 304) {
          const headers = new Headers(assetResp.headers);
          headers.set('Cache-Control', CACHE_CONTROL);
          headers.set('x-edge-cache', 'ASSET');
          return new Response(null, { status: 304, headers });
        }
        if (assetResp.ok && assetResp.body) {
          const acceptEnc = request.headers.get('accept-encoding') ?? '';
          const wantsGzip = acceptEnc.includes('gzip');
          const headers = new Headers(assetResp.headers);
          headers.set('Cache-Control', CACHE_CONTROL);
          headers.set('x-edge-cache', 'ASSET');

          if (wantsGzip && !headers.has('content-encoding')) {
            headers.set('content-encoding', 'gzip');
            headers.delete('content-length');
            // `Vary: Accept-Encoding` so a future no-encoding client
            // gets a separately negotiated entry.
            const vary = headers.get('vary');
            headers.set('vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding');
            return new Response(assetResp.body.pipeThrough(new CompressionStream('gzip')), {
              status: assetResp.status,
              statusText: assetResp.statusText,
              headers,
              // Body is already gzip-encoded; without this the runtime
              // gzips it a second time (encodeBody defaults to
              // "automatic") and browsers receive garbled bytes.
              encodeBody: 'manual',
            });
          }

          return new Response(assetResp.body, {
            status: assetResp.status,
            statusText: assetResp.statusText,
            headers,
          });
        }
      }

      const cache = caches.default;
      const cached = await cache.match(request);
      if (cached) {
        const hit = new Response(cached.body, cached);
        hit.headers.set('x-edge-cache', 'HIT');
        return hit;
      }

      const response = await openNext.fetch(request, env, ctx);

      // Only cache 2xx HTML responses — never error pages or redirects.
      const contentType = response.headers.get('content-type') ?? '';
      if (response.status !== 200 || !contentType.includes('text/html')) {
        return response;
      }

      // Read the body into memory once so we can hand the same bytes to
      // both the client response and the cache.put. The earlier pattern
      // (`new Response(response.body, response)` then `.clone()`) was
      // silently dropping the inlined critical-CSS chunk somewhere in the
      // stream-fork; reading once and constructing both responses from
      // the same Uint8Array sidesteps the streaming edge case entirely.
      const body = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', CACHE_CONTROL);

      const cacheable = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      ctx.waitUntil(cache.put(request, cacheable.clone()));

      const clientResponse = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      clientResponse.headers.set('x-edge-cache', 'MISS');
      return clientResponse;
    } catch (err) {
      console.error(
        `[error] ${request.method} ${new URL(request.url).pathname}:`,
        err.message,
        err.stack
      );
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }),
};

export default worker;
