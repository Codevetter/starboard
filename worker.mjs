// worker.mjs — custom Worker entry that wraps OpenNext with edge cache.
//
// The OpenNext-generated worker (`./.open-next/worker.js`) is imported as
// the inner handler. For cacheable document requests we consult
// `caches.default` first and only fall through to the Next handler on a
// miss.
//
// Cache headers are explicit so CF Edge actually treats the response as
// cacheable (s-maxage-only was getting marked DYNAMIC at the zone level;
// using caches.default sidesteps the zone-level Cache Rules requirement).
//
// All non-GET, non-`/` requests pass straight through to OpenNext.

import openNext from './.open-next/worker.js';
import { withTiming } from './timing.mjs';
import { handleAgentEdge, withApiJsonNotFound } from './agent-edge.mjs';

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
// Anonymous public JSON surfaces. Only routes that serve identical content to
// every guest belong here; anything session-bearing was already bypassed by
// hasAuthCookie above, and /api/discover's optional-session variant is safe
// because signed-in requests never reach this branch.
const CACHEABLE_API_PATTERNS = [
  /^\/api\/repos\/[^/]+$/, // repo detail
  /^\/api\/repos\/[^/]+\/(tools|star-history)$/, // public repo sub-resources
  /^\/api\/catalog-updates$/,
  /^\/api\/tools$/,
  /^\/api\/discover$/,
  /^\/api\/lists\/public\/[^/]+$/,
  /^\/api\/projects\/[^/]+\/(intelligence|recommendations)$/,
];
const API_CACHE_CONTROL = 'public, max-age=300, s-maxage=300';
// Browsers must revalidate document URLs after a deployment so an open client
// cannot keep HTML that references chunks removed by the next build. The
// versioned Cache API key still keeps anonymous document traffic at the edge.
const CACHE_CONTROL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
function isCacheableApiPath(pathname) {
  return CACHEABLE_API_PATTERNS.some((pattern) => pattern.test(pathname));
}
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

// Tracking params don't change the render but would split the cache —
// a crawler or shared link carrying ?utm_source=... gets its own entry.
// Strip them so they collapse onto the canonical entry.
const IGNORED_KEY_PARAMS = /^(utm_|fbclid$|gclid$|dclid$|msclkid$|mc_|igshid$|si$)/i;
function cacheKeyFor(request, versionId) {
  const cacheUrl = new URL(request.url);
  // _rsc is a per-navigation cache-buster on RSC payloads; the payload for a
  // given path+query is identical, so fold it to a stable marker. Deleting it
  // outright would collide RSC and HTML responses under one key.
  const isRsc = cacheUrl.searchParams.has('_rsc') || request.headers.get('rsc') === '1';
  for (const key of [...cacheUrl.searchParams.keys()]) {
    if (IGNORED_KEY_PARAMS.test(key)) cacheUrl.searchParams.delete(key);
  }
  cacheUrl.searchParams.delete('_rsc');
  if (isRsc) cacheUrl.searchParams.set('__rsc', '1');
  cacheUrl.searchParams.set('__starboard_worker_version', versionId);
  return new Request(cacheUrl, request);
}

const worker = {
  fetch: withTiming(async function fetch(request, env, ctx) {
    // Agent / LLM indexing surfaces (fleet GEO standard). This only answers
    // for paths the edge itself owns; everything else falls through below.
    {
      const agent = handleAgentEdge(request);
      if (agent) return agent;
    }
    try {
      // `withApiJsonNotFound` is applied on the way back out: Next.js owns the
      // route table, so only its 404 (not an edge guess) turns into a JSON
      // error body for `/api/*`.
      if (request.method !== 'GET') {
        return withApiJsonNotFound(request, await openNext.fetch(request, env, ctx));
      }
      const url = new URL(request.url);
      const cacheableApi = isCacheableApiPath(url.pathname);
      if (!isCacheableDocumentPath(url.pathname) && !cacheableApi) {
        return withApiJsonNotFound(request, await openNext.fetch(request, env, ctx));
      }
      // Auth-bearing requests bypass the shared cache on EVERY path, not just
      // '/': a signed-in render of a cacheable route must never be stored
      // under the anonymous key (leak) nor served a guest entry (staleness).
      if (hasAuthCookie(request)) {
        return withApiJsonNotFound(request, await openNext.fetch(request, env, ctx));
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

      // `caches` is the Workers Cache API — absent under vitest/node.
      const cache = globalThis.caches?.default;
      if (!cache) {
        return withApiJsonNotFound(request, await openNext.fetch(request, env, ctx));
      }
      const cacheKey = cacheKeyFor(request, env.CF_VERSION_METADATA?.id ?? 'local');
      const cached = await cache.match(cacheKey);
      if (cached) {
        const hit = new Response(cached.body, cached);
        hit.headers.set('x-edge-cache', 'HIT');
        return hit;
      }

      const response = await openNext.fetch(request, env, ctx);

      // Only cache 200s of the expected type — never errors, redirects, or
      // personalized (Set-Cookie) responses. For API paths we additionally
      // honor a handler-declared no-store/private (e.g. degraded fallbacks);
      // document pages emit blanket private/no-store whenever they read the
      // session, but the auth-cookie bypass above guarantees only anonymous
      // renders ever reach the store — their content is identical per guest.
      const contentType = response.headers.get('content-type') ?? '';
      const cacheableType = cacheableApi
        ? contentType.includes('application/json')
        : // text/x-component = RSC payloads for client-side navigation;
          // otherwise every soft nav re-renders the page.
          contentType.includes('text/html') || contentType.includes('text/x-component');
      const originCacheControl = response.headers.get('cache-control') ?? '';
      if (
        response.status !== 200 ||
        !cacheableType ||
        response.headers.has('set-cookie') ||
        (cacheableApi && /\b(no-store|private)\b/i.test(originCacheControl))
      ) {
        // Add Vary: Accept to non-200 HTML responses (e.g. 404) so caches
        // distinguish markdown vs HTML negotiation.
        if (contentType.includes('text/html')) {
          const headers = new Headers(response.headers);
          const vary = headers.get('vary');
          headers.set(
            'vary',
            vary ? `${vary}, Accept, Accept-Encoding` : 'Accept, Accept-Encoding'
          );
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        }
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
      headers.set('Cache-Control', cacheableApi ? API_CACHE_CONTROL : CACHE_CONTROL);
      // Add Vary: Accept for HTML pages that have markdown alternates
      const vary = headers.get('vary');
      headers.set('vary', vary ? `${vary}, Accept, Accept-Encoding` : 'Accept, Accept-Encoding');

      const cacheable = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));

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
