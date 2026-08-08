# Scheduled Jobs

GitHub Actions scheduled workflows. Schedules are defined in
`.github/workflows/*.yml` — that is the executable source of truth; this page
annotates intent, inputs, and dependencies.

## seed-popular (`.github/workflows/seed-popular.yml`)

- **Schedule:** `workflow_dispatch` only. The daily schedule was disabled on
  2026-07-28 after repeated full-corpus updates exhausted the prior database
  row-read allowance.
- **Inputs:** `daily_limit` (default 1000), `tool_enrich_limit` (default 250).
- **Concurrency:** shared group `starboard-embedding`, `cancel-in-progress:
  false`, so seed and standalone backfill cannot duplicate embedding work.
- **Timeout:** 60 minutes.
- **Steps:**
  1. `pnpm db:migrate:remote` (approval-gated D1 migrations).
  2. `pnpm db:seed-popular` (`scripts/seed-popular.ts`) — GitHub Search for
     repos ≥ `MIN_STARS_FLOOR=5000`, with a resumable cursor in `seed_cursor`.
     Uses `${{ github.token }}` deliberately so a stale PAT cannot break seeding.
  3. Authenticated Worker operator request — Workers AI embeddings → Vectorize
     binding, with drift hashes written through the D1 binding.
  4. `pnpm db:enrich-tools` (`scripts/enrich-tools.ts`) — SBOM/tree/manifest
     tool detection → `repo_tools`. `TOOL_MIN_STARS=10000`,
     `TOOL_ENRICH_HARD_LIMIT=750`.
- **Credentials:** scoped D1 `CLOUDFLARE_API_TOKEN`, non-secret
  account/database variables, and the existing AI gateway key as the Worker
  operator bearer. GitHub does not receive Vectorize API access.
- **Safety controls:** metadata walks default to 10 GitHub Search pages and
  hard-cap at 25; unchanged repos do not update or fire FTS maintenance;
  snapshots are written only when star counts change. Re-enable automation only
  with an explicit row-read budget and alert.

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
