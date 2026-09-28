import { recordEndpointHealth } from './endpoint-health.mjs';

/**
 * Backend performance timing middleware for Workers.
 *
 * Wraps a fetch handler to measure response time with
 * `performance.now()`, reports it via the `Server-Timing` response header,
 * and logs requests slower than 200 ms via `console.warn`.
 */
export function withTiming(handler, observeEndpoint = recordEndpointHealth) {
  return async (request, env, ctx) => {
    const start = performance.now();
    const url = new URL(request.url);
    let response;
    try {
      response = await handler(request, env, ctx);
    } catch (error) {
      observeEndpoint(request, 500, performance.now() - start, env, ctx);
      throw error;
    }
    const duration = performance.now() - start;
    observeEndpoint(request, response.status, duration, env, ctx);

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

    return timedResponse;
  };
}
