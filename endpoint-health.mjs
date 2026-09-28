import { createAppHealthClient } from '@saas-maker/app-health';

const INGEST_ENDPOINT = 'https://ingest.sassmaker.com/v1/ingest';

// Keep useful route-level health splits while ensuring user supplied path
// segments (slugs, IDs, repo IDs, and auth provider paths) never leave Starboard.
const ROUTE_TEMPLATES = [
  /^\/api\/auth\/[^/]+(?:\/.*)?$/, // NextAuth provider and callback paths
  /^\/api\/internal\/project-intelligence\/run$/,
  /^\/api\/internal\/external-reviews\/ingest$/,
  /^\/api\/internal\/embed-pending$/,
  /^\/api\/projects\/[^/]+\/recommendations$/,
  /^\/api\/projects\/[^/]+\/intelligence$/,
  /^\/api\/projects\/[^/]+$/,
  /^\/api\/lists\/public\/[^/]+$/,
  /^\/api\/lists\/[^/]+\/share$/,
  /^\/api\/lists\/[^/]+$/,
  /^\/api\/repos\/[^/]+\/comments\/[^/]+\/vote$/,
  /^\/api\/repos\/[^/]+\/comments$/,
  /^\/api\/repos\/[^/]+\/(?:save|star-history|list|similar|likes|tools)$/,
  /^\/api\/repos\/[^/]+$/,
  /^\/api\/(?:github\/projects|growth|stars\/sync|stars|health|projects|discover|embeddings\/generate|tools|catalog-updates|project-preview)$/,
];

function safeRoute(pathname) {
  for (const template of ROUTE_TEMPLATES) {
    if (template.test(pathname)) {
      return pathname
        .replace(/^\/api\/auth\/[^/]+(?:\/.*)?$/, '/api/auth/:route')
        .replace(/^\/api\/projects\/[^/]+\/recommendations$/, '/api/projects/:slug/recommendations')
        .replace(/^\/api\/projects\/[^/]+\/intelligence$/, '/api/projects/:slug/intelligence')
        .replace(/^\/api\/projects\/[^/]+$/, '/api/projects/:slug')
        .replace(/^\/api\/lists\/public\/[^/]+$/, '/api/lists/public/:slug')
        .replace(/^\/api\/lists\/[^/]+\/share$/, '/api/lists/:id/share')
        .replace(/^\/api\/lists\/[^/]+$/, '/api/lists/:id')
        .replace(
          /^\/api\/repos\/[^/]+\/comments\/[^/]+\/vote$/,
          '/api/repos/:repoId/comments/:commentId/vote'
        )
        .replace(/^\/api\/repos\/[^/]+\/comments$/, '/api/repos/:repoId/comments')
        .replace(
          /^\/api\/repos\/[^/]+\/(save|star-history|list|similar|likes|tools)$/,
          '/api/repos/:repoId/$1'
        )
        .replace(/^\/api\/repos\/[^/]+$/, '/api/repos/:repoId');
    }
  }
  return '/api/:route';
}

/** Build an optional observer for API requests handled by the outer Worker. */
export function createEndpointHealthRecorder(createClient = createAppHealthClient) {
  let entry;

  return (request, status, durationMs, env, ctx) => {
    if (!env || typeof env !== 'object') return;
    if (!new URL(request.url).pathname.startsWith('/api/')) return;

    const key =
      typeof env.APP_HEALTH_INGEST_KEY === 'string' ? env.APP_HEALTH_INGEST_KEY.trim() : '';
    if (!key) return;

    const environment =
      typeof env.APP_HEALTH_ENVIRONMENT === 'string'
        ? env.APP_HEALTH_ENVIRONMENT.trim() || 'production'
        : 'production';

    if (!entry || entry.key !== key || entry.environment !== environment) {
      try {
        entry = {
          key,
          environment,
          client: createClient({
            key,
            environment,
            endpoint: INGEST_ENDPOINT,
            runtime: 'worker',
            disableTimer: true,
            maxQueueSize: 100,
            maxBatchSize: 20,
            requestTimeoutMs: 1_000,
            maxRetries: 1,
          }),
        };
      } catch {
        return;
      }
    }

    try {
      entry.client.record({
        method: request.method,
        route: safeRoute(new URL(request.url).pathname),
        status_code: status,
        duration_ms: Math.max(0, Math.round(durationMs)),
      });
      const delivery = entry.client.flush().catch(() => undefined);
      try {
        ctx?.waitUntil(delivery);
      } catch {
        void delivery;
      }
    } catch {
      // Optional monitoring must never change the application response.
    }
  };
}

export const recordEndpointHealth = createEndpointHealthRecorder();
