import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { knowledgePipelineEnabled } from '@/lib/knowledgebase';

const VECTORIZE_QUERY_CAP = 45_000_000;
const VECTORIZE_QUERY_DIMENSIONS = 768;
const VECTORIZE_STATUS_TIMEOUT_MS = 500;

type VectorBudgetState = 'available' | 'insufficient_headroom' | 'unavailable';

interface WorkerVersionMetadata {
  id?: string;
  tag?: string;
  timestamp?: string;
}

function workerVersionMetadata(): WorkerVersionMetadata | null {
  try {
    const { env } = getCloudflareContext();
    return (env as { CF_VERSION_METADATA?: WorkerVersionMetadata }).CF_VERSION_METADATA ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function vectorBudgetState(payload: unknown, monthKey: string): VectorBudgetState {
  if (!isRecord(payload) || payload.monthKey !== monthKey || !isRecord(payload.query))
    return 'unavailable';

  const query = payload.query;
  const { used, remaining, cap } = query;
  if (
    query.state !== 'available' ||
    query.baselineVerified !== true ||
    cap !== VECTORIZE_QUERY_CAP ||
    !isSafeNonNegativeInteger(used) ||
    !isSafeNonNegativeInteger(remaining) ||
    used + remaining !== VECTORIZE_QUERY_CAP
  ) {
    return 'unavailable';
  }

  return remaining < VECTORIZE_QUERY_DIMENSIONS ? 'insufficient_headroom' : 'available';
}

function semanticSurfaceState(
  knowledgebasePathEnabled: boolean,
  budgetState: VectorBudgetState
): 'unverified' | 'unavailable' {
  return knowledgebasePathEnabled || budgetState === 'available' ? 'unverified' : 'unavailable';
}

async function readVectorBudgetState(): Promise<VectorBudgetState> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const { env } = getCloudflareContext();
    const namespace = Reflect.get(env, 'NEURON_BUDGET') as
      | {
          idFromName(name: string): unknown;
          get(id: unknown): {
            fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
          };
        }
      | undefined;
    if (
      !namespace ||
      typeof namespace.idFromName !== 'function' ||
      typeof namespace.get !== 'function'
    )
      return 'unavailable';

    const stub = namespace.get(namespace.idFromName('global-budget'));
    const monthKey = new Date().toISOString().slice(0, 7);
    const read = (async (): Promise<VectorBudgetState> => {
      const response = await stub.fetch('https://internal.local/vectorize-usage', {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) return 'unavailable';
      return vectorBudgetState(await response.json(), monthKey);
    })();
    const deadline = new Promise<VectorBudgetState>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve('unavailable');
      }, VECTORIZE_STATUS_TIMEOUT_MS);
    });
    return await Promise.race([read, deadline]);
  } catch {
    return 'unavailable';
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

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
 * No secrets or budget quantities are exposed. RAG configuration is reported
 * separately from semantic retrieval, which this endpoint does not execute.
 */
export async function GET() {
  const t0 = Date.now();
  const vectorBudgetPromise = readVectorBudgetState();

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

  const version = workerVersionMetadata();
  const revision =
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_REVISION ||
    version?.tag ||
    version?.id ||
    'unknown';

  const ragConfigured = Boolean(process.env.RAG_SERVICE_KEY && process.env.STARBOARD_RAG_INDEX_ID);
  const vectorBudget = await vectorBudgetPromise;
  const semanticState = semanticSurfaceState(knowledgePipelineEnabled(), vectorBudget);

  return NextResponse.json(
    {
      ok: searchOk,
      build: {
        name: 'starboard',
        revision,
        branch: process.env.CF_PAGES_BRANCH ?? (version ? 'worker' : 'unknown'),
      },
      live: true,
      revision,
      rag_configured: ragConfigured,
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
      components: {
        vector_budget: vectorBudget,
      },
      // Per-surface availability — landing and search are reported
      // independently so a live landing page cannot conceal a broken search.
      surfaces: {
        landing: 'unverified',
        search: searchOk ? 'ok' : 'unavailable',
        rag: ragConfigured ? 'ok' : 'fallback',
        // This endpoint does not perform retrieval. The selected Knowledgebase
        // path is not inspected here; the direct Vectorize path is unavailable
        // when its verified monthly query budget cannot admit one vector.
        semantic: semanticState,
      },
    },
    {
      status: searchOk ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
