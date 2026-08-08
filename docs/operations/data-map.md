# Data map and reconstruction

Canonical inventory of stored data, ownership, backup/export/reconstruction
treatment, and refresh-lifecycle controls. Source of truth for the
`data-research-toolbox-automation` capability requirements: authoritative vs
derived classification, reconstruction evidence, and refresh quality bounds.

Per-run refresh state (watermark, output counts, failure state) is written to
`data/refresh-manifest.json` and copied to that GitHub Actions run's summary — see
[`refresh-manifest.md`](refresh-manifest.md) and
[`jobs.md`](jobs.md).

Cloudflare D1 and Vectorize became authoritative on 2026-08-02 after an exact
frozen-source reconciliation. Turso remains intact only as a rollback source;
retirement requires separate approval.

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
| D1 `users` | irreplaceable-user | NextAuth GitHub OAuth | Not reconstructable — GitHub is the source of identity, but user records (email, created_at) must be exported | n/a — export required | 2026-08-02 |
| D1 `repos` (popular ≥5k seeded) | authoritative-source | `scripts/seed-popular.ts` | Re-walk GitHub Search ≥`MIN_STARS_FLOOR` | ~hours (rate-limited, resumable cursor) | 2026-08-02 |
| D1 `user_repos` (starred/saved state) | irreplaceable-user | GitHub sync via `/api/stars/sync` | Re-sync from GitHub starred list (ETag + HTML scrape) | ~seconds per user | 2026-08-02 |
| D1 `user_projects` | irreplaceable-user | Project connection UI/API | Reconnect public GitHub repositories manually | ~seconds per user | 2026-08-08 |
| D1 `user_lists`, `user_repo_lists` | irreplaceable-user | User UI actions | Not reconstructable — user-curated collections | n/a — export required | 2026-08-02 |
| D1 `comments`, `likes`, `comment_votes` | irreplaceable-user | User UI actions | Not reconstructable — user-generated content | n/a — export required | 2026-08-02 |
| D1 `repo_embeddings` hashes + Vectorize `starboard-repos` values | derived | Worker binding embedding jobs | Re-embed from `repos` + `repo_ai_metadata` text via Workers AI | ~minutes (Workers AI quota) | 2026-08-02 |
| D1 `repo_ai_metadata` | derived | `scripts/enrich-repos.ts` (free-ai gateway) | Re-enrich from `repos` metadata via AI | ~minutes per batch | 2026-08-02 |
| D1 `repo_tools` | derived | `scripts/enrich-tools.ts` | Re-detect from GH tree/manifest/SBOM | ~minutes per batch | 2026-08-02 |
| D1 `repo_star_snapshots`, `repo_threshold_events` | derived | `seed-popular.ts` snapshot inserts | Re-derive from `repos` star counts over time | rebuilt on each seed run | 2026-08-02 |
| D1 `seed_cursor` | derived (walk state) | `seed-popular.ts` | Reset to defaults; walk restarts from top | seconds | 2026-08-02 |
| D1 `insight_reports`, `user_alert_preferences` | historical inactive storage | Removed product features | Retained to avoid a destructive migration; no active writers | n/a | 2026-08-08 |
| Cloudflare Worker `starboard` (deployed bundle) | cache | `pnpm deploy:cf` or manual deploy workflow | Rebuild + redeploy | ~minutes | 2026-07-18 |
| knowledgebase Worker RAG index (`STARBOARD_RAG_INDEX_ID`) | derived (RAG index of user repos) | `src/lib/knowledgebase.ts` ingest | Re-ingest from `repos` + README text per user | ~seconds per user | 2026-07-18 |

## Irreplaceable user state — export path

D1 is the system of record for user-generated state. Reconstruction is
**not** possible for: `users`, `user_repos` (saved/organized state beyond
what GitHub stars alone captures), `user_lists`, `user_repo_lists`,
`comments`, `likes`, `comment_votes`, and `user_projects`. The inactive
`insight_reports` and `user_alert_preferences` tables remain part of exports
until a separately approved retention migration exists.

Export path (operator-run, not automated):

```bash
pnpm exec wrangler d1 export starboard --remote --output starboard-user-state.sql
```

A bounded user-state export job is a deferred follow-up (not blocking this
capability). The reconstruction evidence here is the documented export
command plus the rollback-held Turso cutover snapshot during the observation
window.

## Reconstruction paths

### Full popular-pool rebuild (bounded)

`pnpm db:migrate:remote` → scheduled or manual `seed-popular` workflow
(resumable cursor walk of GitHub Search ≥5k stars plus bound Worker embedding backfill) →
`pnpm db:enrich-tools` (tool detection). Total runtime
is bounded by `SEED_METADATA_PAGE_LIMIT` (default 10, hard cap 25 pages/run)
and the workflow's `daily_limit` input (default 1000 embeddings/run). See
[`jobs.md`](jobs.md) §seed-popular.

### Embedding dimension drift

The pinned `EMBEDDING_DIM=768` must match the Vectorize index. A dimension
change requires a deliberately created replacement index, repopulation, and
binding cutover; D1 hash rows are advanced only after vector upserts. See
[`runbooks/embedding-dimension-drift.md`](runbooks/embedding-dimension-drift.md).

### Worker redeploy (cache)

`pnpm deploy:cf` or manually dispatch `.github/workflows/deploy.yml`. Both paths
tag the Worker version with the exact Git SHA. The Worker bundle is a cache of
the source code; no data loss on redeploy.

## Refresh lifecycle controls

Each scheduled or dispatched `seed-popular` GitHub Action records a structured
manifest at `data/refresh-manifest.json` and copies it to the existing GitHub
Actions run summary before the ephemeral runner is discarded. The manifest includes:

- `source_watermark` — GitHub Search cursor (`next_max_stars`/`next_page`)
  and run timestamp
- `bounds` — `METADATA_PAGE_LIMIT`, `DAILY_LIMIT`, `MIN_STARS_FLOOR`
- `timeout` — workflow `timeout-minutes: 60`
- `idempotency` — `INSERT … ON CONFLICT(id) DO UPDATE` for `repos`;
  `INSERT OR IGNORE` for `repo_star_snapshots` and `repo_threshold_events`
- `retries` — `withDbRetry` (4 attempts, exponential backoff) for D1;
  `ghSearch` (4 attempts + rate-limit sleep) for GitHub
- `output_counts` — `upsertedThisRun`, `embedded`, pool totals
- `quality_signal` — non-zero output check + pool coverage ratio
- `freshness` — run wall-clock + delta from prior success
- `failure_state` — unresolved failure state within that run's manifest

A zero-output step advances freshness only with an explicit verified-no-op
reason. Missing evidence, an all-zero searchable pool, and embedding
authentication failure make the refresh fail instead of exiting green.

GitHub run summaries preserve per-run evidence, but they are not a cross-run
state store. Starboard does not yet have a Foundry adapter that persists the
latest refresh watermark/failure state or resolves failures across runs; that
adapter remains an explicit operational gap.
See [`refresh-manifest.md`](refresh-manifest.md) for the schema and the
quality gate implementation in `src/lib/refresh-manifest.ts`.

## Public and API health

| Surface | Health endpoint | Evidence |
| --- | --- | --- |
| Cloudflare Worker (public) | `GET /api/health` | build, live, revision, sanitized errors, latency, real lexical-search probe |
| Landing page | `GET /` (200 = ok) | Static HTML; independent of API health |
| Search API | `GET /api/stars` (401 without session) | Auth-gated; `/api/health` returns 503 when its lexical-search probe fails |
| knowledgebase RAG | `GET /api/stars` relevance path | Falls back to lexical when RAG unavailable; `/api/health` reports `surfaces.rag` |

`/api/health` reports landing availability as `unverified`; it does not probe
or infer the separate static landing surface. A broken required search probe
returns 503 and must not report global health. See
[`src/app/api/health/route.ts`](../../src/app/api/health/route.ts).

## Search activation evidence

Privacy-safe aggregate activation counters are emitted to Foundry (PostHog)
on search and project recommendation views, inspections, feedback, and
saved/organized actions. No raw query text, repo IDs, repo full names, or user
identifiers are sent. See
[`foundry.md`](foundry.md) for the sanitization contract and
[`src/lib/analytics.ts`](../../src/lib/analytics.ts) `trackSearchOutcome`.

## Private-repo redaction

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
