/**
 * Daily seed/refresh of popular GitHub repos into our `repos` + `repo_embeddings` tables.
 *
 * Each run:
 *   1. Walk a bounded slice of GH search across `stars >= MIN_STARS_FLOOR`.
 *      Only changed repos are updated, so unchanged rows do not fire the FTS
 *      maintenance trigger. Cursor resumes between runs and resets after a
 *      complete corpus pass.
 *   2. In direct/local mode, embed up to SEED_DAILY_LIMIT pending repos. The
 *      GitHub workflow delegates this step to the deployed Worker so Workers AI,
 *      Vectorize, and D1 are reached through native bindings.
 *
 * GH metadata walking is free under quota (~120 calls / 5000-per-hour). Bottleneck is
 * the daily embed budget (CF Workers AI). After ~12 catch-up days the pool is fully
 * embedded; subsequent runs pick up only newly-eligible repos and metadata drift.
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
 *   SEED_METADATA_PAGE_LIMIT — GitHub search pages per run, default 10 (hard cap 25)
 *   MIN_STARS_FLOOR       — minimum stars to seed, default 5000
 *   STAR_THRESHOLDS       — comma-separated digest thresholds, default 5000,10000,20000,50000,100000
 *   SEED_EMBED_MODE       — `worker` delegates embeddings to the bound Worker endpoint
 */

import type { DbClient as Client, InStatement } from '../src/db/client';
import { createD1RestClientFromEnv } from '../src/db/rest-client';

import { isRetryableDbError } from '../src/lib/db-retry';
import { buildRepoEmbeddingText, generateEmbeddings, textHash } from '../src/lib/embeddings';
import { recordStep } from '../src/lib/refresh-manifest';
import { createVectorizeRestWriterFromEnv } from '../src/lib/repo-vectors-rest';

const DAILY_LIMIT = parseInt(process.env.SEED_DAILY_LIMIT || '1000', 10);
const REQUESTED_METADATA_PAGE_LIMIT = parseInt(process.env.SEED_METADATA_PAGE_LIMIT || '10', 10);
const METADATA_PAGE_LIMIT = Math.min(Math.max(REQUESTED_METADATA_PAGE_LIMIT || 0, 1), 25);
const MIN_STARS_FLOOR = parseInt(process.env.MIN_STARS_FLOOR || '5000', 10);
const STAR_THRESHOLDS = (process.env.STAR_THRESHOLDS || '5000,10000,20000,50000,100000')
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value >= MIN_STARS_FLOOR)
  .sort((a, b) => a - b);
const PER_PAGE = 100;
const MAX_PAGES_PER_BUCKET = 10; // GH search caps at 1000 results
const BATCH_SIZE = 50;
const DB_MAX_ATTEMPTS = 4;
const DB_RETRY_BASE_MS = 1_000;

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
  items: GhRepo[];
}

interface StoredRepo {
  id: number;
  name: string;
  full_name: string;
  owner_login: string;
  owner_avatar: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  archived: number;
  topics: string;
  repo_updated_at: string | null;
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

async function loadStoredRepos(db: Client, repoIds: number[]): Promise<Map<number, StoredRepo>> {
  if (repoIds.length === 0) return new Map();

  const result = await executeDb(db, {
    sql: `SELECT id,
                 name,
                 full_name,
                 owner_login,
                 owner_avatar,
                 html_url,
                 description,
                 language,
                 stargazers_count,
                 archived,
                 topics,
                 repo_updated_at
          FROM repos
          WHERE id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
    args: [JSON.stringify(repoIds)],
  });

  return new Map(
    result.rows.map((row) => [
      row.id as number,
      {
        id: row.id as number,
        name: row.name as string,
        full_name: row.full_name as string,
        owner_login: row.owner_login as string,
        owner_avatar: row.owner_avatar as string,
        html_url: row.html_url as string,
        description: row.description as string | null,
        language: row.language as string | null,
        stargazers_count: row.stargazers_count as number,
        archived: row.archived as number,
        topics: row.topics as string,
        repo_updated_at: row.repo_updated_at as string | null,
      },
    ])
  );
}

function storedRepoDiffers(stored: StoredRepo | undefined, repo: GhRepo): boolean {
  if (!stored) return true;

  return (
    stored.name !== repo.name ||
    stored.full_name !== repo.full_name ||
    stored.owner_login !== repo.owner.login ||
    stored.owner_avatar !== repo.owner.avatar_url ||
    stored.html_url !== repo.html_url ||
    stored.description !== repo.description ||
    stored.language !== repo.language ||
    stored.stargazers_count !== repo.stargazers_count ||
    stored.archived !== (repo.archived ? 1 : 0) ||
    stored.topics !== JSON.stringify(repo.topics ?? []) ||
    stored.repo_updated_at !== repo.updated_at
  );
}

function buildThresholdEventStatements(
  repos: GhRepo[],
  previousStarCounts: Map<number, number>
): InStatement[] {
  const stmts: InStatement[] = [];

  for (const repo of repos) {
    const previousStars = previousStarCounts.get(repo.id);

    for (const threshold of STAR_THRESHOLDS) {
      const crossed =
        previousStars === undefined
          ? threshold === MIN_STARS_FLOOR && repo.stargazers_count >= threshold
          : previousStars < threshold && repo.stargazers_count >= threshold;

      if (!crossed) continue;

      stmts.push({
        sql: `INSERT OR IGNORE INTO repo_threshold_events
              (repo_id, threshold, previous_stars, current_stars)
              VALUES (?, ?, ?, ?)`,
        args: [repo.id, threshold, previousStars ?? null, repo.stargazers_count],
      });
    }
  }

  return stmts;
}

async function ghSearch(q: string, page: number, token: string): Promise<GhSearchResponse> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`;
  const maxAttempts = 4;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
      console.warn(`GitHub search request failed. Retrying in ${waitMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (res.status >= 500 && attempt < maxAttempts) {
      const waitMs = 2 ** (attempt - 1) * 1000;
      console.warn(`GitHub search returned ${res.status}. Retrying in ${waitMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (res.status === 403 || res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset');
      const waitMs = reset ? parseInt(reset, 10) * 1000 - Date.now() : 60_000;
      console.warn(`Rate limited. Sleeping ${Math.round(waitMs / 1000)}s...`);
      await new Promise((r) => setTimeout(r, Math.max(waitMs, 1000)));
      return ghSearch(q, page, token);
    }
    if (!res.ok) {
      throw new Error(`GH search failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }
  throw new Error(`GH search request failed after ${maxAttempts} attempts: ${String(lastError)}`);
}

async function upsertRepos(db: Client, repos: GhRepo[]): Promise<number[]> {
  if (repos.length === 0) return [];
  const storedRepos = await loadStoredRepos(
    db,
    repos.map((repo) => repo.id)
  );
  const changedRepos = repos.filter((repo) => storedRepoDiffers(storedRepos.get(repo.id), repo));
  if (changedRepos.length === 0) return [];

  const previousStarCounts = new Map(
    changedRepos.flatMap((repo) => {
      const stored = storedRepos.get(repo.id);
      return stored ? [[repo.id, stored.stargazers_count] as const] : [];
    })
  );
  const stmts: InStatement[] = changedRepos.map((r) => ({
    sql: `INSERT INTO repos (id, name, full_name, owner_login, owner_avatar, html_url,
            description, language, stargazers_count, archived, topics, repo_created_at, repo_updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            full_name = excluded.full_name,
            owner_login = excluded.owner_login,
            owner_avatar = excluded.owner_avatar,
            html_url = excluded.html_url,
            description = excluded.description,
            language = excluded.language,
            stargazers_count = excluded.stargazers_count,
            archived = excluded.archived,
            topics = excluded.topics,
            repo_updated_at = excluded.repo_updated_at
          WHERE repos.name IS NOT excluded.name
             OR repos.full_name IS NOT excluded.full_name
             OR repos.owner_login IS NOT excluded.owner_login
             OR repos.owner_avatar IS NOT excluded.owner_avatar
             OR repos.html_url IS NOT excluded.html_url
             OR repos.description IS NOT excluded.description
             OR repos.language IS NOT excluded.language
             OR repos.stargazers_count IS NOT excluded.stargazers_count
             OR repos.archived IS NOT excluded.archived
             OR repos.topics IS NOT excluded.topics
             OR repos.repo_updated_at IS NOT excluded.repo_updated_at`,
    args: [
      r.id,
      r.name,
      r.full_name,
      r.owner.login,
      r.owner.avatar_url,
      r.html_url,
      r.description,
      r.language,
      r.stargazers_count,
      r.archived ? 1 : 0,
      JSON.stringify(r.topics ?? []),
      r.created_at,
      r.updated_at,
    ],
  }));
  const snapshotStmts: InStatement[] = changedRepos
    .filter(
      (repo) =>
        !storedRepos.has(repo.id) ||
        storedRepos.get(repo.id)!.stargazers_count !== repo.stargazers_count
    )
    .map((repo) => ({
      sql: `INSERT OR IGNORE INTO repo_star_snapshots (repo_id, stargazers_count)
            VALUES (?, ?)`,
      args: [repo.id, repo.stargazers_count],
    }));
  const thresholdEventStmts = buildThresholdEventStatements(changedRepos, previousStarCounts);

  await batchDb(db, [...stmts, ...snapshotStmts, ...thresholdEventStmts]);
  return changedRepos.map((r) => r.id);
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

async function loadCursor(db: Client) {
  const r = await executeDb(db, 'SELECT * FROM seed_cursor WHERE id = 1');
  if (r.rows.length === 0) {
    await executeDb(db, 'INSERT INTO seed_cursor (id) VALUES (1)');
    return { next_max_stars: 999999999, next_page: 1 };
  }
  return {
    next_max_stars: r.rows[0]!.next_max_stars as number,
    next_page: r.rows[0]!.next_page as number,
  };
}

async function saveCursor(db: Client, next_max_stars: number, next_page: number) {
  await executeDb(db, {
    sql: `UPDATE seed_cursor
          SET next_max_stars = ?, next_page = ?, updated_at = datetime('now')
          WHERE id = 1`,
    args: [next_max_stars, next_page],
  });
}

/**
 * Walk GH search from `cursor.next_max_stars` down to MIN_STARS_FLOOR. Persists cursor
 * between pages so a crash mid-run resumes cleanly. When the walk completes (we've gone
 * below the floor), reset cursor for the next pass — that's how new repos crossing
 * threshold get discovered on subsequent runs.
 */
async function walkAndUpsert(db: Client, ghToken: string): Promise<number> {
  const cursor = await loadCursor(db);
  console.info(`[walk] resume cursor: max_stars=${cursor.next_max_stars} page=${cursor.next_page}`);

  let max_stars = cursor.next_max_stars;
  let page = cursor.next_page;
  let lowestSeenInBucket = max_stars;
  let upsertedThisRun = 0;
  let pagesProcessed = 0;

  while (max_stars >= MIN_STARS_FLOOR && pagesProcessed < METADATA_PAGE_LIMIT) {
    const q = `stars:${MIN_STARS_FLOOR}..${max_stars}`;
    console.info(`[walk] q="${q}" page=${page}`);
    const result = await ghSearch(q, page, ghToken);
    pagesProcessed += 1;

    if (result.items.length === 0) {
      if (page === 1) break;
      const newMax = lowestSeenInBucket - 1;
      if (newMax < MIN_STARS_FLOOR || newMax === max_stars) break;
      max_stars = newMax;
      page = 1;
      lowestSeenInBucket = newMax;
      await saveCursor(db, max_stars, page);
      continue;
    }

    upsertedThisRun += (await upsertRepos(db, result.items)).length;
    const minStarsInPage = result.items[result.items.length - 1].stargazers_count;
    lowestSeenInBucket = Math.min(lowestSeenInBucket, minStarsInPage);
    page++;

    if (page > MAX_PAGES_PER_BUCKET) {
      max_stars = lowestSeenInBucket - 1;
      page = 1;
      lowestSeenInBucket = max_stars;
    }

    await saveCursor(db, max_stars, page);
    // GH search caps authenticated users at 30 req/min (1 per 2.0s).
    // 2100ms keeps us safely under without idling too much.
    await new Promise((r) => setTimeout(r, 2100));
  }

  if (pagesProcessed >= METADATA_PAGE_LIMIT && max_stars >= MIN_STARS_FLOOR) {
    console.info(
      `[walk] paused after bounded ${pagesProcessed}-page run. upserted ${upsertedThisRun} repo rows; cursor preserved at max_stars=${max_stars} page=${page}.`
    );
    return upsertedThisRun;
  }

  // Walk complete. Reset cursor so the next run rediscovers from the top —
  // catches new ≥5k repos and refreshes star counts on existing rows.
  await saveCursor(db, 999999999, 1);
  console.info(
    `[walk] complete after ${pagesProcessed} pages. upserted ${upsertedThisRun} repo rows. cursor reset.`
  );
  return upsertedThisRun;
}

async function main() {
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) throw new Error('GITHUB_TOKEN required');

  const db = createD1RestClientFromEnv();

  const upserted = await walkAndUpsert(db, ghToken);

  // A zero-row walk is a verified no-op only because walkAndUpsert returns
  // after successfully querying GitHub and preserving/resetting its cursor.
  recordStep({
    step: 'seed_walk',
    sourceWatermark: `cursor_after_walk`,
    bounds: {
      metadata_page_limit: METADATA_PAGE_LIMIT,
      min_stars_floor: MIN_STARS_FLOOR,
      max_pages_per_bucket: MAX_PAGES_PER_BUCKET,
    },
    timeoutS: 60 * 60,
    idempotency:
      'Stored-row comparison skips unchanged repos; changed repos use INSERT … ON CONFLICT(id) DO UPDATE; snapshots are written only for star-count changes',
    outputCount: upserted,
    expectedMinOutput: 0,
    verifiedNoopReason:
      upserted === 0 ? 'GitHub search walk completed and cursor state was preserved' : undefined,
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
