const CACHEABLE_DOCUMENT_PATHS = new Set([
  '/',
  '/discover',
  '/explore',
  '/tools',
  '/stack-builder',
  '/radar',
  '/about',
  '/privacy',
  '/terms',
]);
const CACHEABLE_PREFIXES = ['/tools', '/lists', '/explore'];
// Browsers must revalidate document URLs after a deployment so an open client
// cannot keep HTML that references chunks removed by the next build. The
// versioned Cache API key still keeps anonymous document traffic at the edge.
const CACHE_CONTROL = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';
export function isCacheableDocumentPath(pathname) {
  if (CACHEABLE_DOCUMENT_PATHS.has(pathname)) return true;
  for (const prefix of CACHEABLE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

// Covers Auth.js / NextAuth session-token cookies, secure prefixes, chunk
// suffixes, and legacy session_token cookies. Signed-in requests use live SSR.
const AUTH_COOKIE_FRAGMENTS = ['session_token', 'session-token'];

export function hasAuthCookie(request) {
  const cookie = request.headers.get('cookie');
  if (!cookie) return false;
  return AUTH_COOKIE_FRAGMENTS.some((c) => cookie.includes(c));
}

function cacheKeyFor(request, versionId) {
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('__starboard_worker_version', versionId);
  return new Request(cacheUrl, request);
}

async function serveLandingAsset(request, env) {
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
  if (env.ASSETS && new URL(request.url).pathname === '/') {
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

  return null;
}
function nonCacheableResponse(response) {
  // Only cache 2xx HTML responses — never error pages or redirects.
  const contentType = response.headers.get('content-type') ?? '';
  const policy = response.headers.get('cache-control') ?? '';
  if (
    response.status !== 200 ||
    !contentType.includes('text/html') ||
    /(?:^|[,\s])(?:private|no-store|no-cache)(?:$|[,\s=])/i.test(policy) ||
    response.headers.has('set-cookie')
  ) {
    // Add Vary: Accept to non-200 HTML responses (e.g. 404) so caches
    // distinguish markdown vs HTML negotiation.
    if (contentType.includes('text/html')) {
      const headers = new Headers(response.headers);
      const vary = headers.get('vary');
      headers.set('vary', vary ? `${vary}, Accept, Accept-Encoding` : 'Accept, Accept-Encoding');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  }

  return null;
}

export async function serveCachedDocument(request, env, ctx, openNext) {
  const asset = await serveLandingAsset(request, env);
  if (asset) return asset;
  const cache = caches.default;
  const cacheKey = cacheKeyFor(request, env.CF_VERSION_METADATA?.id ?? 'local');
  const cached = await cache.match(cacheKey);
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set('x-edge-cache', 'HIT');
    return hit;
  }

  const response = await openNext.fetch(request, env, ctx);

  const uncached = nonCacheableResponse(response);
  if (uncached) return uncached;

  // Read the body into memory once so we can hand the same bytes to
  // both the client response and the cache.put. The earlier pattern
  // (`new Response(response.body, response)` then `.clone()`) was
  // silently dropping the inlined critical-CSS chunk somewhere in the
  // stream-fork; reading once and constructing both responses from
  // the same Uint8Array sidesteps the streaming edge case entirely.
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', CACHE_CONTROL);
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
}
