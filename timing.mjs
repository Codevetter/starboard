import { createAppHealthClient } from '@saas-maker/app-health';

/**
 * Backend performance timing middleware for Workers.
 *
 * Wraps a fetch handler to measure response time with
 * `performance.now()`, reports it via the `Server-Timing` response header,
 * and logs requests slower than 200 ms via `console.warn`.
 */
export function withTiming(handler) {
  return async (request, env, ctx) => {
    const start = performance.now();
    const url = new URL(request.url);
    const response = await handler(request, env, ctx);
    const duration = performance.now() - start;

    // Add Server-Timing header
    const headers = new Headers(response.headers);
    headers.set('Server-Timing', `app;dur=${Math.round(duration)}`);
    const timedResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

    // Log slow requests
    if (duration > 200) {
      console.warn(`[slow] ${request.method} ${url.pathname} — ${Math.round(duration)}ms`);
    }

    observeRequest(request, timedResponse, duration, env, ctx);
    return timedResponse;
  };
}

const INGEST_ENDPOINT = 'https://ingest.sassmaker.com/v1/ingest';

/**
 * Collapse request paths to route templates. Telemetry must never capture raw
 * path params (repo ids, slugs, auth surface), so anything unrecognized maps
 * to null and is simply not recorded.
 */
function routeFor(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p.startsWith('/api/')) {
    return p
      .replace(/^\/api\/repos\/([^/]+)\/comments\/[^/]+/, '/api/repos/:id/comments/:commentId')
      .replace(/^\/api\/repos\/[^/]+/, '/api/repos/:id')
      .replace(/^\/api\/projects\/[^/]+/, '/api/projects/:slug')
      .replace(/^\/api\/lists\/public\/[^/]+/, '/api/lists/public/:slug')
      .replace(/^\/api\/lists\/[^/]+/, '/api/lists/:id');
  }
  if (p.startsWith('/explore/')) return '/explore/:path';
  if (p.startsWith('/tools/')) return '/tools/:key';
  if (p.startsWith('/projects/')) return '/projects/:slug';
  if (p.startsWith('/lists/')) return '/lists/:slug';
  const exact = [
    '/',
    '/about',
    '/privacy',
    '/terms',
    '/tools',
    '/stars',
    '/projects',
    '/discover',
    '/catalog-updates',
    '/project-preview',
    '/login',
    '/changelog',
    '/sitemap.xml',
    '/robots.txt',
    '/llms.txt',
    '/index.md',
    '/humans.txt',
  ];
  return exact.includes(p) ? p : null;
}

/**
 * Ships per-route method/status/duration to the App Health ingest collector.
 * Silent no-op until APP_HEALTH_INGEST_KEY is configured; telemetry can never
 * fail a request.
 */
function observeRequest(request, response, durationMs, env, ctx) {
  const key =
    typeof env?.APP_HEALTH_INGEST_KEY === 'string' ? env.APP_HEALTH_INGEST_KEY.trim() : '';
  const route = routeFor(new URL(request.url).pathname);
  if (!key || !route) return;
  try {
    const client = createAppHealthClient({
      key,
      endpoint: INGEST_ENDPOINT,
      environment: 'production',
      runtime: 'worker',
      maxQueueSize: 2,
      maxBatchSize: 2,
      maxRetries: 0,
      requestTimeoutMs: 1000,
      disableTimer: true,
    });
    client.record({
      method: request.method,
      route,
      status_code: response.status,
      duration_ms: Math.max(0, Math.round(durationMs)),
    });
    ctx.waitUntil(client.flush().catch(() => undefined));
  } catch {
    // Telemetry must never take down the request path.
  }
}
