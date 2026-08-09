# CI/CD

GitHub Actions workflows live in `.github/workflows/`. Schedules are documented
in [jobs.md](jobs.md); this page covers the push/PR and deploy pipelines.

## CI (`.github/workflows/ci.yml`)

- **Triggers:** push to `main`/`master`; PRs against `main`/`master`.
- **Steps:** checkout → pnpm setup → Node 22 → `pnpm install --frozen-lockfile`
  → `pnpm lint` → `pnpm test:coverage` → `pnpm build:e2e` → Chromium install
  → `pnpm test:e2e`. `build:e2e` creates the OpenNext and Astro-overlaid
  artifact without Cloudflare cache population or operator credentials. CI
  previews that artifact so the browser suite verifies the landing and app
  together.
- **Permissions:** default.

## Deploy (`.github/workflows/deploy.yml`)

- **Triggers:** `workflow_dispatch` only. Push CI keeps `main` releasable but
  never changes production.
- **Steps:** checkout → pnpm → Node 22 → install (`--ignore-scripts`) → apply
  pending additive D1 migrations → `pnpm cf:build` (with
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` so
  `populateCache local` can resolve bindings) → `wrangler deploy` via
  `cloudflare/wrangler-action@v4` with `--tag ${{ github.sha }}` → curl smoke.
- A migration failure stops the release before application traffic changes.
- See [deploy.md](deploy.md) for the full pipeline and required secrets.

## Docs (`.github/workflows/docs.yml`)

- **Triggers:** push/PR on docs-touching paths (`docs/**`, `AGENTS.md`,
  `STATUS.md`, `PROJECT_STATUS.md`, `README.md`, `blume.config.ts`,
  `scripts/check-docs.mjs`, the workflow itself) + `workflow_dispatch`.
- **Steps:** checkout → Node 22 → `node scripts/check-docs.mjs`.
- Catches broken links, missing required sections, and files outside the
  canonical docs structure.

## Cloudflare operator smoke (`.github/workflows/cloudflare-operator-smoke.yml`)

- **Trigger:** `workflow_dispatch` only.
- **Steps:** read-only D1 API check → authenticated Worker probe of its D1 and
  Vectorize bindings.
- Keeps Vectorize API credentials out of GitHub while still proving the live
  binding path used by embedding jobs.

## Scheduled jobs

See [jobs.md](jobs.md) for `seed-popular` and `embed-pending`.
