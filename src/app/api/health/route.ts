import { NextResponse } from 'next/server';

import { db } from '@/db';

/**
 * Public health endpoint for the Starboard Cloudflare Worker.
 *
 * Reports build, live, revision, errors, latency, and a minimal lexical-search
 * capability probe. Landing availability is not inferred by this API. Satisfies the
 * `data-research-toolbox-automation` "Public and API health" requirement.
 *
 * The structured refresh manifest (`data/refresh-manifest.json`) is written
 * by the `seed-popular` GitHub Action in Node.js, not by the Worker, so it
 * is not readable from the deployed Worker runtime. Operators consult the GitHub Actions run
 * summary for per-run refresh watermark/freshness evidence. The
 * `indexing.search_probe` flag here is the live Worker-side equivalent.
 *
 * No secrets are exposed. The RAG configured flag is reported as a boolean
 * only.
 */
export async function GET() {
  const t0 = Date.now();

  let searchOk = false;
  try {
    // Exercise the required lexical-search capability, not just database
    // reachability. The query may return no rows; successful FTS evaluation
    // proves the schema and MATCH operator are available.
    await db.execute({
      sql: 'SELECT rowid FROM repos_fts WHERE repos_fts MATCH ? LIMIT 1',
      args: ['starboard_health_probe'],
    });
    searchOk = true;
  } catch (err) {
    // Keep diagnostic detail in private runtime logs. Public health responses
    // expose only a stable error code so URLs, tokens, and driver details can
    // never leak through this unauthenticated endpoint.
    console.error('Starboard search health probe failed', err);
  }

  const revision = process.env.CF_PAGES_COMMIT_SHA || process.env.NEXT_PUBLIC_REVISION || 'unknown';

  const ragConfigured = Boolean(process.env.RAG_SERVICE_KEY && process.env.STARBOARD_RAG_INDEX_ID);

  return NextResponse.json(
    {
      ok: searchOk,
      build: {
        name: 'starboard',
        revision,
        branch: process.env.CF_PAGES_BRANCH ?? 'unknown',
      },
      live: true,
      revision,
      errors: {
        search: searchOk ? null : 'search_capability_unavailable',
        rag: ragConfigured
          ? null
          : 'RAG_SERVICE_KEY or STARBOARD_RAG_INDEX_ID not set; relevance search falls back to lexical',
      },
      latency_ms: Date.now() - t0,
      indexing: {
        // The Worker cannot read the checkout-local refresh manifest. The
        // Actions run summary holds per-run refresh evidence; this probe is
        // the live Worker-side search capability signal.
        search_probe: searchOk,
        refresh_evidence: 'seed-popular GitHub Actions run summary',
      },
      // Per-surface availability — landing and search are reported
      // independently so a live landing page cannot conceal a broken search.
      surfaces: {
        landing: 'unverified',
        search: searchOk ? 'ok' : 'unavailable',
        rag: ragConfigured ? 'ok' : 'fallback',
      },
    },
    {
      status: searchOk ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
