/**
 * Weekly additions-only reconciliation of popular GitHub repositories.
 *
 * Each run:
 *   1. Enumerate the complete GitHub `stars >= MIN_STARS_FLOOR` identity set
 *      through non-overlapping creation-date partitions that each fit in one
 *      Search response.
 *   2. Read every stored D1 repository ID once, diff both sets in memory, and
 *      fail before writes if additions exceed SEED_MAX_ADDITIONS.
 *   3. Fetch details and insert only genuinely new repositories. Existing rows
 *      are never updated and stored-only rows are never deleted.
 *   4. In direct/local mode, embed up to SEED_DAILY_LIMIT pending repos. The
 *      GitHub workflow delegates this step to the deployed Worker so Workers AI,
 *      Vectorize, and D1 are reached through native bindings.
 *
 * GitHub Search calls are paced below the authenticated 30 requests/minute
 * bucket. A normal reconciliation makes roughly 250 calls, below the workflow
 * GITHUB_TOKEN allowance of 1000 requests/hour per repository.
 *
 * Required env:
 *   CLOUDFLARE_ACCOUNT_ID
 *   D1_DATABASE_ID
 *   CLOUDFLARE_API_TOKEN — D1 Write (and Vectorize Write for direct local embedding mode)
 *   AI_GATEWAY_URL
 *   AI_GATEWAY_API_KEY
 *   GITHUB_TOKEN          — fine-grained PAT, public_repo:read
 * Optional env:
 *   SEED_DAILY_LIMIT      — embeddings per run, default 1000
 *   SEED_MAX_ADDITIONS    — abort-before-write bound, default 100
 *   SEED_MIN_SOURCE_REPOS — reject suspiciously small source sets, default 5000
 *   MIN_STARS_FLOOR       — minimum stars to seed, default 5000
 *   SEED_EMBED_MODE       — `worker` delegates embeddings to the bound Worker endpoint
 */

import type { DbClient as Client, InStatement } from '../src/db/client';
import { createD1RestClientFromEnv } from '../src/db/rest-client';

import { isRetryableDbError } from '../src/lib/db-retry';
import { buildRepoEmbeddingText, generateEmbeddings, textHash } from '../src/lib/embeddings';
import {
  enumeratePopularCatalog,
  GITHUB_SEARCH_PAGE_SIZE,
  planCatalogReconciliation,
  type CatalogSearchResult,
} from '../src/lib/popular-catalog-reconciliation';
import { recordStep } from '../src/lib/refresh-manifest';
import { createVectorizeRestWriterFromEnv } from '../src/lib/repo-vectors-rest';

const DAILY_LIMIT = parseInt(process.env.SEED_DAILY_LIMIT || '1000', 10);
const MIN_STARS_FLOOR = parseInt(process.env.MIN_STARS_FLOOR || '5000', 10);
const MAX_ADDITIONS_HARD_LIMIT = 100;
const MAX_ADDITIONS = parseInt(process.env.SEED_MAX_ADDITIONS || '100', 10);
const MIN_SOURCE_REPOS = parseInt(process.env.SEED_MIN_SOURCE_REPOS || '5000', 10);
const BATCH_SIZE = 50;
const DB_MAX_ATTEMPTS = 4;
const DB_RETRY_BASE_MS = 1_000;
const GITHUB_SEARCH_DELAY_MS = 2_100;

if (!Number.isInteger(MAX_ADDITIONS) || MAX_ADDITIONS < 0) {
  throw new Error(`SEED_MAX_ADDITIONS must be a non-negative integer; received ${MAX_ADDITIONS}`);
}
if (MAX_ADDITIONS > MAX_ADDITIONS_HARD_LIMIT) {
  throw new Error(
    `SEED_MAX_ADDITIONS ${MAX_ADDITIONS} exceeds hard safety limit ${MAX_ADDITIONS_HARD_LIMIT}`
  );
}

interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; avatar_url: string };
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  archived?: boolean;
  topics: string[] | null;
  created_at: string;
  updated_at: string;
}

interface GhSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GhRepo[];
}

async function withDbRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= DB_MAX_ATTEMPTS || !isRetryableDbError(err)) {
        throw err;
      }
      const waitMs = DB_RETRY_BASE_MS * 2 ** (attempt - 1);
      console.warn(`[db] ${label} failed on attempt ${attempt}; retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

function executeDb(db: Client, stmt: InStatement | string) {
  return withDbRetry('execute', () => db.execute(stmt));
}

function batchDb(db: Client, stmts: InStatement[]) {
  return withDbRetry('batch', () => db.batch(stmts));
}

async function loadStoredRepoIds(db: Client): Promise<Set<number>> {
  const result = await executeDb(db, 'SELECT id FROM repos');
  return new Set(result.rows.map((row) => row.id as number));
}

let lastGitHubSearchAt = 0;

async function paceGitHubSearch(): Promise<void> {
  const sinceLastSearch = Date.now() - lastGitHubSearchAt;
  if (lastGitHubSearchAt > 0 && sinceLastSearch < GITHUB_SEARCH_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, GITHUB_SEARCH_DELAY_MS - sinceLastSearch));
  }
  lastGitHubSearchAt = Date.now();
}

async function githubJson<T>(
  url: string,
  token: string,
  label: string,
  beforeAttempt?: () => Promise<void>
): Promise<T> {
  const maxAttempts = 4;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await beforeAttempt?.();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'starboard-seed-bot',
        },
      });
    } catch (error) {
      lastError = error;
      const waitMs = 2 ** (attempt - 1) * 1000;
      console.warn(`${label} request failed. Retrying in ${waitMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (res.status >= 500 && attempt < maxAttempts) {
      const waitMs = 2 ** (attempt - 1) * 1000;
      console.warn(`${label} returned ${res.status}. Retrying in ${waitMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if ((res.status === 403 || res.status === 429) && attempt < maxAttempts) {
      const retryAfter = res.headers.get('retry-after');
      const reset = res.headers.get('x-ratelimit-reset');
      const requestedWaitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : reset
          ? parseInt(reset, 10) * 1000 - Date.now()
          : 60_000;
      const waitMs = Math.min(Math.max(requestedWaitMs, 1_000), 60_000);
      console.warn(`${label} rate limited. Sleeping ${Math.round(waitMs / 1000)}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (!res.ok) {
      throw new Error(`${label} failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }
  throw new Error(`${label} failed after ${maxAttempts} attempts: ${String(lastError)}`);
}

async function ghSearch(q: string, token: string): Promise<CatalogSearchResult> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${GITHUB_SEARCH_PAGE_SIZE}&page=1`;
  const result = await githubJson<GhSearchResponse>(url, token, 'GitHub search', paceGitHubSearch);
  return {
    totalCount: result.total_count,
    incomplete: result.incomplete_results,
    repos: result.items.map((repo) => ({ id: repo.id, fullName: repo.full_name })),
  };
}

function ghRepo(fullName: string, token: string): Promise<GhRepo> {
  const url = `https://api.github.com/repos/${encodeURIComponent(fullName).replace('%2F', '/')}`;
  return githubJson<GhRepo>(url, token, `GitHub repository ${fullName}`);
}

async function insertNewRepos(db: Client, repos: GhRepo[]): Promise<number[]> {
  if (repos.length === 0) return [];
  const insertedIds: number[] = [];

  for (let offset = 0; offset < repos.length; offset += BATCH_SIZE) {
    const batch = repos.slice(offset, offset + BATCH_SIZE);
    const insertResults = await batchDb(
      db,
      batch.map((repo) => ({
        sql: `INSERT OR IGNORE INTO repos
              (id, name, full_name, owner_login, owner_avatar, html_url,
               description, language, stargazers_count, archived, topics,
               repo_created_at, repo_updated_at, cataloged_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [
          repo.id,
          repo.name,
          repo.full_name,
          repo.owner.login,
          repo.owner.avatar_url,
          repo.html_url,
          repo.description,
          repo.language,
          repo.stargazers_count,
          repo.archived ? 1 : 0,
          JSON.stringify(repo.topics ?? []),
          repo.created_at,
          repo.updated_at,
        ],
      }))
    );
    const inserted = batch.filter((_, index) => (insertResults[index]?.rowsAffected ?? 0) > 0);
    insertedIds.push(...inserted.map((repo) => repo.id));

    if (inserted.length > 0) {
      await batchDb(
        db,
        inserted.flatMap((repo): InStatement[] => [
          {
            sql: `INSERT OR IGNORE INTO repo_star_snapshots (repo_id, stargazers_count)
                  VALUES (?, ?)`,
            args: [repo.id, repo.stargazers_count],
          },
          {
            sql: `INSERT OR IGNORE INTO repo_threshold_events
                  (repo_id, threshold, previous_stars, current_stars)
                  VALUES (?, ?, NULL, ?)`,
            args: [repo.id, MIN_STARS_FLOOR, repo.stargazers_count],
          },
        ])
      );
    }
  }

  return insertedIds;
}

async function embedPending(db: Client, limit: number): Promise<number> {
  const vectors = createVectorizeRestWriterFromEnv();
  const pending = await executeDb(db, {
    sql: `SELECT r.id,
                 r.full_name,
                 r.description,
                 r.language,
                 r.topics,
                 re.text_hash,
                 ram.summary,
                 ram.category,
                 ram.subcategories,
                 ram.use_cases,
                 ram.keywords
          FROM repos r
          LEFT JOIN repo_embeddings re ON re.repo_id = r.id
          LEFT JOIN repo_ai_metadata ram ON ram.repo_id = r.id
          WHERE r.stargazers_count >= ?
          ORDER BY r.stargazers_count DESC
          LIMIT ?`,
    args: [MIN_STARS_FLOOR, limit * 2], // overfetch — we filter by hash
  });

  const toEmbed: { id: number; text: string; hash: string }[] = [];
  for (const row of pending.rows) {
    const text = buildRepoEmbeddingText({
      full_name: row.full_name as string,
      description: row.description as string | null,
      language: row.language as string | null,
      topics: row.topics as string,
      ai: row.summary
        ? {
            summary: row.summary as string,
            category: row.category as string,
            subcategories: row.subcategories as string,
            use_cases: row.use_cases as string,
            keywords: row.keywords as string,
          }
        : null,
    });
    const hash = textHash(text);
    if (row.text_hash !== hash) {
      toEmbed.push({ id: row.id as number, text, hash });
    }
    if (toEmbed.length >= limit) break;
  }

  if (toEmbed.length === 0) return 0;

  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);
    const embeddings = await generateEmbeddings(batch.map((r) => r.text));
    await vectors.upsert(batch.map((item, j) => ({ repoId: item.id, values: embeddings[j] })));
    const stmts: InStatement[] = batch.map((item) => ({
      sql: `INSERT INTO repo_embeddings (repo_id, text_hash)
            VALUES (?, ?)
            ON CONFLICT(repo_id) DO UPDATE SET
              text_hash = excluded.text_hash`,
      args: [item.id, item.hash],
    }));
    await batchDb(db, stmts);
    console.info(`  embedded ${i + batch.length}/${toEmbed.length} (${batch.length} this batch)`);
  }

  return toEmbed.length;
}

function isEmbeddingAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /Embedding API error 401|invalid_api_key|Unauthorized/i.test(err.message);
}

interface ReconciliationResult {
  sourceCount: number;
  storedCount: number;
  plannedAdditions: number;
  insertedAdditions: number;
  storedOnlyCount: number;
  leafPartitions: number;
}

async function reconcileCatalog(db: Client, ghToken: string): Promise<ReconciliationResult> {
  console.info(`[reconcile] enumerating complete GitHub catalog at ≥${MIN_STARS_FLOOR} stars`);
  const source = await enumeratePopularCatalog((query) => ghSearch(query, ghToken), {
    minStars: MIN_STARS_FLOOR,
    minExpectedRepos: MIN_SOURCE_REPOS,
  });
  const storedIds = await loadStoredRepoIds(db);
  const plan = planCatalogReconciliation(source.repos, storedIds, MAX_ADDITIONS);

  console.info(
    `[reconcile] source=${source.sourceCount} stored=${storedIds.size} ` +
      `additions=${plan.additions.length} stored_only=${plan.storedOnlyCount} ` +
      `leaf_partitions=${source.leafPartitions}`
  );

  // Resolve every source-only repository before the first write. A removed,
  // renamed, or newly ineligible repository therefore fails closed instead of
  // leaving a partial reconciliation.
  const additionDetails: GhRepo[] = [];
  for (const identity of plan.additions) {
    const repo = await ghRepo(identity.fullName, ghToken);
    if (repo.id !== identity.id) {
      throw new Error(
        `GitHub repository identity changed for ${identity.fullName}: ${identity.id} -> ${repo.id}`
      );
    }
    if (repo.stargazers_count < MIN_STARS_FLOOR) {
      throw new Error(
        `GitHub repository ${repo.full_name} fell below ${MIN_STARS_FLOOR} stars during reconciliation`
      );
    }
    additionDetails.push(repo);
  }

  const insertedIds = await insertNewRepos(db, additionDetails);
  console.info(
    `[reconcile] inserted ${insertedIds.length}/${plan.additions.length} planned additions`
  );

  return {
    sourceCount: source.sourceCount,
    storedCount: storedIds.size,
    plannedAdditions: plan.additions.length,
    insertedAdditions: insertedIds.length,
    storedOnlyCount: plan.storedOnlyCount,
    leafPartitions: source.leafPartitions,
  };
}

async function main() {
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) throw new Error('GITHUB_TOKEN required');

  const db = createD1RestClientFromEnv();

  let reconciliation: ReconciliationResult;
  try {
    reconciliation = await reconcileCatalog(db, ghToken);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    recordStep({
      step: 'seed_reconciliation',
      sourceWatermark: null,
      bounds: {
        min_stars_floor: MIN_STARS_FLOOR,
        min_source_repos: MIN_SOURCE_REPOS,
        max_additions: MAX_ADDITIONS,
      },
      timeoutS: 60 * 60,
      idempotency:
        'Complete source and stored ID sets are diffed before INSERT OR IGNORE; existing rows are never updated and stored-only rows are never deleted',
      outputCount: 0,
      expectedMinOutput: 0,
      error: message,
    });
    throw error;
  }

  recordStep({
    step: 'seed_reconciliation',
    sourceWatermark: `github_unique_ids:${reconciliation.sourceCount}`,
    bounds: {
      min_stars_floor: MIN_STARS_FLOOR,
      min_source_repos: MIN_SOURCE_REPOS,
      max_additions: MAX_ADDITIONS,
      source_count: reconciliation.sourceCount,
      stored_count: reconciliation.storedCount,
      planned_additions: reconciliation.plannedAdditions,
      stored_only_count: reconciliation.storedOnlyCount,
      leaf_partitions: reconciliation.leafPartitions,
    },
    timeoutS: 60 * 60,
    idempotency:
      'Complete source and stored ID sets are diffed before INSERT OR IGNORE; existing rows are never updated and stored-only rows are never deleted',
    outputCount: reconciliation.insertedAdditions,
    expectedMinOutput: 0,
    verifiedNoopReason:
      reconciliation.insertedAdditions === 0
        ? `Complete GitHub catalog reconciled at ${reconciliation.sourceCount} unique IDs with no additions`
        : undefined,
  });

  console.info(`[embed] generating up to ${DAILY_LIMIT} embeddings`);
  let embedded = 0;
  let embedError: string | null = null;
  const workerEmbeddingMode = process.env.SEED_EMBED_MODE === 'worker';
  try {
    if (workerEmbeddingMode) {
      console.info('[embed] delegated to the Worker binding step');
    } else {
      embedded = await embedPending(db, DAILY_LIMIT);
    }
  } catch (err) {
    if (!isEmbeddingAuthError(err)) {
      embedError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      recordStep({
        step: 'seed_embed',
        sourceWatermark: null,
        bounds: { daily_limit: DAILY_LIMIT, batch_size: BATCH_SIZE },
        timeoutS: 60 * 30,
        idempotency:
          'INSERT INTO repo_embeddings … ON CONFLICT(repo_id) DO UPDATE (text_hash guards drift)',
        outputCount: 0,
        expectedMinOutput: 0,
        error: embedError,
      });
      throw err;
    }
    embedError = 'AI gateway authentication failed (skipped embeddings; repo seeding completed)';
    console.warn(
      '[embed] skipped: AI gateway authentication failed. Repo seeding completed; rotate/fix AI_GATEWAY_API_KEY to resume scheduled embeddings.'
    );
    if (process.env.GITHUB_ACTIONS) {
      console.warn(
        '::warning title=Starboard embeddings skipped::AI gateway authentication failed after repo seeding completed. Rotate/fix AI_GATEWAY_API_KEY to resume scheduled embeddings.'
      );
    }
  }
  console.info(`[embed] generated ${embedded} embeddings`);

  recordStep({
    step: 'seed_embed',
    sourceWatermark: null,
    bounds: { daily_limit: DAILY_LIMIT, batch_size: BATCH_SIZE },
    timeoutS: 60 * 30,
    idempotency:
      'INSERT INTO repo_embeddings … ON CONFLICT(repo_id) DO UPDATE (text_hash guards drift)',
    outputCount: embedded,
    expectedMinOutput: 0,
    verifiedNoopReason: workerEmbeddingMode
      ? 'Embedding is delegated to the subsequent Worker binding step'
      : embedded === 0 && !embedError
        ? 'Pending-embedding query completed with no hash-drift candidates'
        : undefined,
    error: embedError,
  });

  const totals = await executeDb(
    db,
    `SELECT
       (SELECT COUNT(*) FROM repos WHERE stargazers_count >= ${MIN_STARS_FLOOR}) AS repos_in_pool,
       (SELECT COUNT(*) FROM repo_embeddings re
          JOIN repos r ON r.id = re.repo_id
          WHERE r.stargazers_count >= ${MIN_STARS_FLOOR}) AS embedded_in_pool`
  );
  const t = totals.rows[0]!;
  const reposInPool = t.repos_in_pool as number;
  const embeddedInPool = t.embedded_in_pool as number;
  console.info(`[done] pool ≥${MIN_STARS_FLOOR} stars: ${embeddedInPool}/${reposInPool} embedded`);

  // A populated searchable pool is the minimum end-to-end evidence. This
  // prevents an all-zero refresh from exiting green even when individual
  // bounded steps legitimately had no new work.
  const coverageRecord = recordStep({
    step: 'seed_pool_coverage',
    sourceWatermark: null,
    bounds: { min_stars_floor: MIN_STARS_FLOOR },
    timeoutS: 60,
    idempotency: 'read-only aggregate',
    outputCount: embeddedInPool,
    expectedMinOutput: 1,
  });

  // Authentication failures are already persisted as degraded refresh evidence
  // and emitted as a GitHub Actions warning above. The repository refresh is
  // still useful and complete, so do not turn that successful bounded step into
  // a red scheduled run. Unexpected embedding failures continue to throw from
  // the catch block where they are classified.
  if (coverageRecord.quality_failed) {
    throw new Error('Refresh quality verification failed: searchable pool evidence is missing');
  }
}

main().catch((err) => {
  console.error('Seed run failed:', err);
  process.exit(1);
});
