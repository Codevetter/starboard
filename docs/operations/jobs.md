# Scheduled Jobs

GitHub Actions scheduled workflows. Schedules are defined in
`.github/workflows/*.yml` — that is the executable source of truth; this page
annotates intent, inputs, and dependencies.

## seed-popular (`.github/workflows/seed-popular.yml`)

- **Schedule:** Sundays at 03:17 UTC and manual `workflow_dispatch`. The
  non-top-of-hour minute reduces GitHub Actions scheduling contention.
- **Inputs:** `daily_limit` (embedding limit, default 1000),
  `tool_enrich_limit` (default 250), and `max_additions` (default 100).
- **Concurrency:** shared group `starboard-embedding`, `cancel-in-progress:
  false`, so seed and standalone backfill cannot duplicate embedding work.
- **Timeout:** 60 minutes.
- **Steps:**
  1. `pnpm db:migrate:remote` (approval-gated D1 migrations).
  2. `pnpm db:seed-popular` (`scripts/seed-popular.ts`) — completely enumerate
     GitHub Search repos ≥ `MIN_STARS_FLOOR=5000` through non-overlapping
     creation-date partitions that each fit one response; compare the resulting
     IDs with one `SELECT id FROM repos`; fetch details and insert only IDs absent
     from D1. Uses `${{ github.token }}` deliberately so a stale PAT cannot break
     reconciliation.
  3. Authenticated Worker operator request — Workers AI embeddings → Vectorize
     binding, with drift hashes written through the D1 binding.
  4. `pnpm db:enrich-tools` (`scripts/enrich-tools.ts`) — SBOM/tree/manifest
     tool detection → `repo_tools`. `TOOL_MIN_STARS=10000`,
     `TOOL_ENRICH_HARD_LIMIT=750`.
- **Credentials:** scoped D1 `CLOUDFLARE_API_TOKEN`, non-secret
  account/database variables, and the existing AI gateway key as the Worker
  operator bearer. GitHub does not receive Vectorize API access.
- **Completeness controls:** any `incomplete_results`, duplicate identity,
  truncated date partition, source-count drift, or unique-ID mismatch fails the
  run before D1 writes. Root source counts are checked before and after the walk.
- **D1 budget controls:** the job reads all stored IDs once (currently roughly
  15,000 rows, about 0.3% of Cloudflare's 5 million free daily row-read
  allowance), then applies `SEED_MAX_ADDITIONS` before detail fetches or writes.
  The scheduled default is 100 additions against the 100,000 free daily
  row-write allowance, and code rejects manual values above 100 before GitHub or
  D1 access. Existing rows are not updated, stored-only rows are not deleted,
  and new rows are inserted in batches of 50. The existing embedding and tool
  enrichment steps remain bounded at 1,000 and 250 repositories respectively;
  because unchanged hashes are skipped, a normal weekly run processes only new
  or independently changed rows. See Cloudflare's
  [current D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
- **GitHub budget controls:** Search requests are sequential and paced at 2.1
  seconds, below the authenticated 30 requests/minute Search bucket. Complete
  enumeration is expected to use roughly 250 requests, below the workflow
  token's 1,000 requests/hour per-repository allowance.

- **Failure visibility:** a follow-on `alert` job runs after every *scheduled*
  seed and keeps exactly one open tracking issue labelled
  `scheduled-job-failure`. A failed run opens that issue (or comments on the
  existing one) with a link to the failing run; the next successful scheduled
  run closes it. Manual `workflow_dispatch` runs are skipped because an operator
  is already watching, and cancelled or skipped runs neither open nor close the
  issue. The `alert` job holds the only `issues: write` grant in the workflow;
  `seed` itself stays `contents: read`.

## embed-pending (`.github/workflows/embed-pending.yml`)

- **Schedule:** `workflow_dispatch` only (manual).
- **Inputs:** `embed_limit` (default 3000).
- **Concurrency:** shared group `starboard-embedding`, `cancel-in-progress:
  false`.
- **Timeout:** 30 minutes.
- **Steps:** `pnpm db:migrate:remote` → authenticated Worker operator request
  (backfill through native Workers AI, Vectorize, and D1 bindings).
- **Credentials:** scoped D1 migration token + the existing AI gateway key as
  the Worker operator bearer. GitHub does not receive Vectorize API access.

## Cloudflare Workers scheduled triggers

**None configured.** `wrangler.jsonc` has no `[[triggers]] crons` entry. All
scheduling is via GitHub Actions.
