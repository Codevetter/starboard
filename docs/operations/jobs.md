# Scheduled Jobs

GitHub Actions scheduled workflows. Schedules are defined in
`.github/workflows/*.yml` — that is the executable source of truth; this page
annotates intent, inputs, and dependencies.

## seed-popular (`.github/workflows/seed-popular.yml`)

- **Schedule:** `workflow_dispatch` only. The daily schedule was disabled on
  2026-07-28 after repeated full-corpus updates exhausted the Turso row-read
  allowance.
- **Inputs:** `daily_limit` (default 1000), `tool_enrich_limit` (default 250).
- **Concurrency:** group `seed-popular`, `cancel-in-progress: false`.
- **Timeout:** 60 minutes.
- **Steps:**
  1. `pnpm db:migrate` (dimension self-heal fires here — see
     [runbooks/embedding-dimension-drift.md](runbooks/embedding-dimension-drift.md)).
  2. `pnpm db:seed-popular` (`scripts/seed-popular.ts`) — GitHub Search for
     repos ≥ `MIN_STARS_FLOOR=5000`, resumable cursor in `seed_cursor`, embeddings
     via HTTP gateway (Node env). Uses `${{ github.token }}` deliberately so a
     stale PAT cannot break seeding.
  3. `pnpm db:enrich-tools` (`scripts/enrich-tools.ts`) — SBOM/tree/manifest
     tool detection → `repo_tools`. `TOOL_MIN_STARS=10000`,
     `TOOL_ENRICH_HARD_LIMIT=750`.
- **Secrets:** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AI_GATEWAY_URL`,
  `AI_GATEWAY_API_KEY`.
- **Safety controls:** metadata walks default to 10 GitHub Search pages and
  hard-cap at 25; unchanged repos do not update or fire FTS maintenance;
  snapshots are written only when star counts change. Re-enable automation only
  with an explicit row-read budget and alert.

## enrich-repos (`.github/workflows/enrich-repos.yml`)

- **Schedule:** `workflow_dispatch` only (manual).
- **Inputs:** `enrich_limit` (50), `hard_limit` (200), `reasoning_effort`
  (auto/low/medium/high, default medium), `min_reasoning_level` (low/medium/high,
  default medium).
- **Concurrency:** group `enrich-repos`, `cancel-in-progress: false`.
- **Timeout:** 20 minutes.
- **Steps:** `pnpm db:migrate` → `pnpm db:enrich-repos` (AI metadata enrichment
  via free-ai gateway with capped reasoning).
- **Secrets:** Turso + `AI_GATEWAY_URL`/`AI_GATEWAY_API_KEY`.

## embed-pending (`.github/workflows/embed-pending.yml`)

- **Schedule:** `workflow_dispatch` only (manual).
- **Inputs:** `embed_limit` (default 3000).
- **Concurrency:** group `embed-pending`, `cancel-in-progress: false`.
- **Timeout:** 30 minutes.
- **Steps:** `pnpm db:migrate` → `pnpm db:seed-embeddings` (backfill
  `repo_embeddings`).
- **Secrets:** Turso + `AI_GATEWAY_URL`/`AI_GATEWAY_API_KEY`.

## weekly-threshold-digest (`.github/workflows/weekly-threshold-digest.yml`)

- **Schedule:** `workflow_dispatch` only. Automatic database-backed digest runs
  are disabled by the Turso circuit-breaker policy.
- **Inputs:** `days` (default 7).
- **Timeout:** 15 minutes.
- **Permissions:** `contents: read`, `issues: write`.
- **Steps:**
  1. `pnpm db:migrate`.
  2. `pnpm --silent weekly:threshold-digest > digest.md` (generates the digest
     markdown).
  3. Create or update a GitHub issue titled
     `Starboard weekly repo digest - <date>` (idempotent — edits an existing open
     issue with the same title if present).
  4. `pnpm digest:send-emails` — fail-closed: skipped with a log when
     `RESEND_API_KEY` is unset.
- **Secrets:** Turso, `RESEND_API_KEY` (optional), `DIGEST_EMAIL_FROM` (repo
  variable, optional).

## weekly (`.github/workflows/weekly.yml`)

- **Schedule:** `cron: '0 9 * * 1'` (Mondays 09:00 UTC) + `workflow_dispatch`.
- See [ci-cd.md](ci-cd.md).

## Cloudflare Workers scheduled triggers

**None configured.** `wrangler.jsonc` has no `[[triggers]] crons` entry. All
scheduling is via GitHub Actions.
