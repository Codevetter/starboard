# Data map and reconstruction

Canonical inventory of stored data, ownership, backup/export/reconstruction
treatment, and refresh-lifecycle controls. Source of truth for the
`data-research-toolbox-automation` capability requirements: authoritative vs
derived classification, reconstruction evidence, and refresh quality bounds.

Live refresh state (watermark, last run, output counts, failure state) lives
in `data/refresh-manifest.json` — see
[`refresh-manifest.md`](refresh-manifest.md) and
[`jobs.md`](jobs.md).

## Classification legend

| Class | Meaning | Backup treatment |
| --- | --- | --- |
| **authoritative-source** | Pulled from an external upstream we do not own | Not backed up — re-fetchable from upstream |
| **derived** | Reconstructable from authoritative sources + code | Not backed up — bounded rebuild path documented |
| **cache** | Performance/edge cache; safe to drop | Not backed up — rebuilt on demand |
| **irreplaceable-user** | User-generated state we cannot reconstruct | Must be exported; documented export path required |

## Inventory

| Store | Class | Owner | Reconstruction | Expected cost | Last verified |
| --- | --- | --- | --- | --- | --- |
| Turso `users` | irreplaceable-user | NextAuth GitHub OAuth | Not reconstructable — GitHub is the source of identity, but user records (email, created_at) must be exported | n/a — export required | 2026-07-18 |
| Turso `repos` (popular ≥5k seeded) | authoritative-source | `scripts/seed-popular.ts` | Re-walk GitHub Search ≥`MIN_STARS_FLOOR` | ~hours (rate-limited, resumable cursor) | 2026-07-18 |
| Turso `user_repos` (starred/saved state) | irreplaceable-user | GitHub sync via `/api/stars/sync` | Re-sync from GitHub starred list (ETag + HTML scrape) | ~seconds per user | 2026-07-18 |
| Turso `user_lists`, `user_repo_lists` | irreplaceable-user | User UI actions | Not reconstructable — user-curated collections | n/a — export required | 2026-07-18 |
| Turso `comments`, `likes`, `comment_votes` | irreplaceable-user | User UI actions | Not reconstructable — user-generated content | n/a — export required | 2026-07-18 |
| Turso `repo_embeddings` (768-d vectors) | derived | `scripts/seed-popular.ts` embed phase + `pnpm db:seed-embeddings` | Re-embed from `repos` + `repo_ai_metadata` text via Workers AI | ~minutes (CF Workers AI quota) | 2026-07-18 |
| Turso `repo_ai_metadata` | derived | `scripts/enrich-repos.ts` (free-ai gateway) | Re-enrich from `repos` metadata via AI | ~minutes per batch | 2026-07-18 |
| Turso `repo_tools` | derived | `scripts/enrich-tools.ts` | Re-detect from GH tree/manifest/SBOM | ~minutes per batch | 2026-07-18 |
| Turso `repo_star_snapshots`, `repo_threshold_events` | derived | `seed-popular.ts` snapshot inserts | Re-derive from `repos` star counts over time | rebuilt on each seed run | 2026-07-18 |
| Turso `seed_cursor` | derived (walk state) | `seed-popular.ts` | Reset to defaults; walk restarts from top | seconds | 2026-07-18 |
| Turso `insight_reports` | irreplaceable-user | User "share" actions | Not reconstructable — user-curated snapshots (with `redact_private=1` default) | n/a — export required | 2026-07-18 |
| Turso `user_alert_preferences` | irreplaceable-user | User UI actions | Not reconstructable | n/a — export required | 2026-07-18 |
| `data/fleet-projects.generated.json` | derived (fleet snapshot) | `pnpm fleet:extract-projects` | Regenerate from local fleet repos | seconds | 2026-07-18 |
| Cloudflare Worker `starboard` (deployed bundle) | cache | `pnpm build:cf` + `wrangler deploy` / CI push-to-main | Rebuild + redeploy | ~minutes | 2026-07-18 |
| knowledgebase Worker RAG index (`STARBOARD_RAG_INDEX_ID`) | derived (RAG index of user repos) | `src/lib/knowledgebase.ts` ingest | Re-ingest from `repos` + README text per user | ~seconds per user | 2026-07-18 |

## Irreplaceable user state — export path

Turso is the system of record for user-generated state. Reconstruction is
**not** possible for: `users`, `user_repos` (saved/organized state beyond
what GitHub stars alone captures), `user_lists`, `user_repo_lists`,
`comments`, `likes`, `comment_votes`, `insight_reports`,
`user_alert_preferences`.

Export path (operator-run, not automated):

```bash
turso db shell <db-name> .dump > starboard-user-state-$(date +%Y%m%d).sql
```

A bounded user-state export job is a deferred follow-up (not blocking this
capability). The reconstruction evidence here is the documented export
command + the Turso replication that ships with the managed service.

## Reconstruction paths

### Full popular-pool rebuild (bounded)

`pnpm db:migrate` (self-heals embedding dimension drift) → `pnpm db:seed-popular`
(resumable cursor walk of GitHub Search ≥5k stars) → `pnpm db:seed-embeddings`
(backfill vectors) → `pnpm db:enrich-tools` (tool detection). Total runtime
is bounded by `SEED_METADATA_PAGE_LIMIT` (default 120 pages/run) and
`SEED_DAILY_LIMIT` (default 1000 embeddings/run). See
[`jobs.md`](jobs.md) §seed-popular.

### Embedding dimension drift (self-heal)

`pnpm db:migrate` runs `ensureEmbeddingDimension()` which drops and recreates
`repo_embeddings` if the pinned `EMBEDDING_DIM=768` doesn't match the live
table. The daily `seed-popular` workflow runs `db:migrate` first, so drift
self-heals without manual surgery. See
[`runbooks/embedding-dimension-drift.md`](runbooks/embedding-dimension-drift.md).

### Worker redeploy (cache)

`pnpm build:cf && pnpm deploy:cf` or push to `main` (CI auto-deploys). The
Worker bundle is a cache of the source code; no data loss on redeploy.

## Refresh lifecycle controls

The daily `seed-popular` GitHub Action records a structured manifest at
`data/refresh-manifest.json` (operator-local; the Action writes to its
ephemeral runner but the schema is documented for local runs) with:

- `source_watermark` — GitHub Search cursor (`next_max_stars`/`next_page`)
  and run timestamp
- `bounds` — `METADATA_PAGE_LIMIT`, `DAILY_LIMIT`, `MIN_STARS_FLOOR`
- `timeout` — workflow `timeout-minutes: 60`
- `idempotency` — `INSERT … ON CONFLICT(id) DO UPDATE` for `repos`;
  `INSERT OR IGNORE` for `repo_star_snapshots` and `repo_threshold_events`
- `retries` — `withDbRetry` (4 attempts, exponential backoff) for Turso;
  `ghSearch` (4 attempts + rate-limit sleep) for GitHub
- `output_counts` — `upsertedThisRun`, `embedded`, pool totals
- `quality_signal` — non-zero output check + pool coverage ratio
- `freshness` — run wall-clock + delta from prior success
- `failure_state` — durable record of the last unresolved failure (or `null`)

A run that exits successfully with zero output where the declared expectation
is non-zero fails quality verification and does **not** advance freshness.
See [`refresh-manifest.md`](refresh-manifest.md) for the schema and the
quality gate implementation in `src/lib/refresh-manifest.ts`.

## Public and API health

| Surface | Health endpoint | Evidence |
| --- | --- | --- |
| Cloudflare Worker (public) | `GET /api/health` | build, live, revision, errors, latency, Turso reachability, last refresh watermark, search-bundle presence |
| Landing page | `GET /` (200 = ok) | Static HTML; independent of API health |
| Search API | `GET /api/stars` (401 without session) | Auth-gated; `/api/health` reports `surfaces.search` independently from `surfaces.landing` |
| knowledgebase RAG | `GET /api/stars` relevance path | Falls back to lexical when RAG unavailable; `/api/health` reports `surfaces.rag` |

Landing availability and search availability are reported independently — a
live landing page with a broken search API must not report global health. See
[`src/app/api/health/route.ts`](../../src/app/api/health/route.ts).

## Search activation evidence

Privacy-safe aggregate activation counters are emitted to Foundry (PostHog)
on successful search result inspection and saved/organized actions. No raw
query text, repo IDs, repo full names, or user identifiers are sent. See
[`foundry.md`](foundry.md) for the sanitization contract and
[`src/lib/analytics.ts`](../../src/lib/analytics.ts) `trackSearchOutcome`.

## Private-repo redaction

- `insight_reports.redact_private` defaults to `1` — shared reports redact
  private repo identity by default.
- Foundry activation events carry **no** repo identity (no `full_name`,
  `repo_id`, or query text). See [`foundry.md`](foundry.md).
- The knowledgebase RAG index stores `full_name` in document metadata for
  result-to-repo mapping; this is the search backend, not Foundry, and is
  user-scoped via `user_id` in the index.

## Bounded Toolbox marketing experiments

Quiet discoverability experiments are recorded in
`data/experiments-manifest.json` with canonical destination, attribution,
approved claims, expiry, and stop rules. No experiment triggers corpus
expansion, ranking redesign, or autonomous product work. See
[`experiments.md`](experiments.md).
