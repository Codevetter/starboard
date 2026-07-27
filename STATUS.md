# STATUS — Starboard

Last updated: 2026-07-25

## Current objective

Keep Starboard's starred-repo rediscovery, semantic search, fleet
recommendations, discovery, radar, alerts, and shareable reports healthy and
improving in small, verified slices. Live at
[starboard.codevetter.com](https://starboard.codevetter.com).

For the deeper product status (features, timeline, surfaces), see
[PROJECT_STATUS.md](PROJECT_STATUS.md). For architecture and decisions, see
[docs/](docs/index.md).

## Active work

- **Public Discover ready to ship** (2026-07-25): guests can browse, search,
  sort, filter, paginate, and open public repository details, while saves,
  collections, and other personalized controls remain authenticated. The
  landing CTA again points to `/discover`. Focused API tests, the full test
  suite, typecheck, lint, build, and local guest-shell browser verification
  pass. Production deployment remains operator-owned.
- **Documentation consolidation** (2026-07-18): built a maintainable,
  local-first `docs/` knowledge system with a Blume presentation layer,
  link/structure validator (`scripts/check-docs.mjs`), and Docs CI. AGENTS.md
  slimmed to a bootloader; STATUS.md introduced; pre-split ADRs, plans, retros,
  the security audit, and the OSS evaluation were reorganized into the canonical
  structure. See [docs/index.md](docs/index.md).

## Recent shipped

- **2026-07-13** — Star History + Tool Intelligence: Discover supports stored
  30-day growth ordering and detected-tool facets; tool enrichment reuses
  persisted AI/README-derived metadata before GitHub manifest requests; the 5k+
  seed walk has a hard per-run page bound with conflict-safe snapshot inserts
  and resumable cursors. 94 tests, typecheck, lint, and production build pass.
- **2026-07-11** — Scheduled seed reliability: GitHub search retries transient
  network and 5xx failures with bounded exponential backoff; alert preference
  fixtures include the current email opt-out default.
- **2026-07-02** — Added global try/catch error handler to OpenNext worker
  (`worker.mjs`).

## Blockers

- (none currently blocking development)

## Unresolved questions / deferred

- **Weekly alert email delivery** — digest payloads and inbox exist; the
  Resend/SMTP path is the ops-owned next step. The `weekly-threshold-digest`
  workflow is fail-closed (skips email when `RESEND_API_KEY` is unset). See
  [docs/operations/jobs.md](docs/operations/jobs.md).
- **Recommendation scorer weights** — fixture-validated but not yet tuned
  against large real-user libraries. Tune only when
  `src/lib/recommendation-eval.ts` stays green. See
  [docs/development/testing.md](docs/development/testing.md).
- **GitHub HTML scraping for star lists** — brittle to markup changes; monitor
  sync error rates. See [docs/knowledge/learnings.md](docs/knowledge/learnings.md).
- **RAG path hardening** — verify `knowledgebase` binding ingest lag and
  lexical-only behavior under partial Worker outages. Without `RAG_SERVICE_KEY`
  / `STARBOARD_RAG_INDEX_ID`, `/api/stars` relevance search falls back to
  lexical-only. See [docs/architecture/data-flow.md](docs/architecture/data-flow.md).
- **Large-library performance** — profile sync, tag, collection, and project
  recommendation flows for users with 1000+ stars.
- **OpenSpec `Purpose: TBD`** — some `openspec/specs/*/spec.md` files left a
  placeholder Purpose after archiving. Update when next touched. See
  [docs/development/openspec.md](docs/development/openspec.md).
- **Security audit action items** (2026-03-28, paused) — rotate `AUTH_SECRET`,
  `AUTH_GITHUB_SECRET`, `TURSO_AUTH_TOKEN` before resuming development; confirm
  old non-Cloudflare deployment targets are paused. See
  [docs/archive/security-audit-2026-03-28.md](docs/archive/security-audit-2026-03-28.md)
  and [docs/operations/runbooks/rotate-secrets.md](docs/operations/runbooks/rotate-secrets.md).

## Next steps

1. Keep `seed-popular` manual until a provider-side row-read budget and alert
   can stop a run before it threatens the Turso allowance.
2. Wire weekly digest email delivery once in-app payloads prove stable.
3. Tune recommendation weights only via the eval harness.
4. Harden the RAG path against partial Worker outages.
