import { NextResponse } from 'next/server';

import { db } from '@/db';

export const runtime = 'edge';

/**
 * Public health endpoint for the Starboard Cloudflare Worker.
 *
 * Reports build, live, revision, errors, latency, Turso reachability, and
 * per-surface availability — independently from landing availability so a
 * live landing page cannot conceal a broken search/API path. Satisfies the
 * `data-research-toolbox-automation` "Public and API health" requirement.
 *
 * The structured refresh manifest (`data/refresh-manifest.json`) is written
 * by the `seed-popular` GitHub Action in Node.js, not by the Worker, so it
 * is not readable from edge runtime. Operators consult the manifest file or
 * the Action run logs for refresh watermark/freshness evidence. The
 * `indexing.turso_reachable` flag here is the live Worker-side equivalent.
 *
 * No secrets are exposed. The RAG configured flag is reported as a boolean
 * only.
 */
export async function GET() {
  const t0 = Date.now();

  let tursoOk = false;
  let tursoError: string | null = null;
  try {
    // Lightweight reachability probe — a single SELECT 1. Auth-gated routes
    // still 401 without a session; this route is intentionally unauth-gated
    // so external monitors can probe it.
    await db.execute('SELECT 1');
    tursoOk = true;
  } catch (err) {
    tursoError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }

  const revision = process.env.CF_PAGES_COMMIT_SHA || process.env.NEXT_PUBLIC_REVISION || 'unknown';

  const ragConfigured = Boolean(process.env.RAG_SERVICE_KEY && process.env.STARBOARD_RAG_INDEX_ID);

  return NextResponse.json(
    {
      ok: tursoOk,
      build: {
        name: 'starboard',
        revision,
        branch: process.env.CF_PAGES_BRANCH ?? 'unknown',
      },
      live: true,
      revision,
      errors: {
        turso: tursoError,
        rag: ragConfigured
          ? null
          : 'RAG_SERVICE_KEY or STARBOARD_RAG_INDEX_ID not set; relevance search falls back to lexical',
      },
      latency_ms: Date.now() - t0,
      indexing: {
        // The Worker cannot read the operator-local refresh manifest; this
        // is the live Worker-side reachability flag. Refresh watermark /
        // freshness / failure state live in `data/refresh-manifest.json`
        // (written by the seed-popular GitHub Action) and the Action logs.
        turso_reachable: tursoOk,
        refresh_manifest_location:
          'data/refresh-manifest.json (operator-local; written by seed-popular GitHub Action)',
      },
      // Per-surface availability — landing and search are reported
      // independently so a live landing page cannot conceal a broken search.
      surfaces: {
        landing: 'ok',
        search: tursoOk ? 'ok' : 'degraded',
        rag: ragConfigured ? 'ok' : 'fallback',
      },
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
