# starboard — PROJECT STATUS

Last updated: 2026-08-02

## Why/What

Starboard turns a large GitHub star list into a searchable personal knowledge base. Active product surfaces: starred-repo dashboard with tags, collections, filters, and semantic search; fleet-aware **My Projects** recommendations; discovery and repo detail pages; radar maintainer signals; weekly alert inbox and digest payloads; and shareable read-only insight reports. Live: [starboard.codevetter.com](https://starboard.codevetter.com).

Out of scope: organization/team dashboards, non-GitHub providers, ATS features, and real-time push notifications.

## Dependencies

| Layer | Choice |
|-------|--------|
| App | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui, dark default |
| Data | Cloudflare D1 (relational + FTS5) and Vectorize (768d ANN) — raw SQL, no ORM |
| Auth | NextAuth v5 (GitHub OAuth, `read:user`) |
| Client state | SWR (data), nuqs (URL-backed filters/sort) |
| AI / search | Cloudflare Workers AI `@cf/baai/bge-base-en-v1.5` (768d); optional `knowledgebase` Worker via service binding |
| Deploy | Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`) |
| CI | GitHub Actions — push CI + manual SHA-tagged deploy + manual seed/enrich/embed |

**Local dev:** `pnpm install && cp .env.example .env.local && pnpm dev` → http://localhost:3000

**Key checks:** `pnpm test:coverage` · `pnpm build` · `pnpm build:cf` (Cloudflare path)

```
GitHub OAuth (NextAuth)
        │
        ▼
Star sync (ETag + HTML scrape for star lists) ──► D1 (users, repos, user_repos, tags, lists, comments, votes)
        │
        ├── Full-text + facet search (GET /api/stars)
        ├── Semantic search: knowledgebase Worker; lexical-only when shared RAG is unavailable
        ├── Fleet snapshot: data/fleet-projects.generated.json → My Projects scorer
        ├── Radar: maintainer/release signals → alert preferences + inbox
        └── Insight reports: slugged public snapshots (radar, recommendations, cleanup)
```

**Embedding contract:** `EMBEDDING_DIM=768` in `src/lib/embeddings.ts` matches the `starboard-repos` Vectorize index. D1 stores only repository IDs and text hashes; dimension changes require a deliberate replacement index and re-embedding.

**Data model highlights:** tags stored as JSON arrays on `user_repos`; virtualized grid via `@tanstack/react-virtual`; GitHub access token in session for sync; project recommendations suppress packages already used by the target fleet project before ranking.

| Concern | Detail |
|---------|--------|
| Hosting | Cloudflare Worker `starboard` via OpenNext |
| Database | Cloudflare D1 `starboard` — apply ordered schema with `pnpm db:migrate:remote` |
| Secrets | `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`; `AI_GATEWAY_API_KEY` for authenticated operator jobs; `RAG_SERVICE_KEY` for relevance RAG. Any legacy unused `TURSO_*` bindings are separate credential-cleanup work. |
| Embedding model | `@cf/baai/bge-base-en-v1.5` — change model, dimension, and replacement Vectorize index together |
| Fleet snapshot | Refresh `data/fleet-projects.generated.json` after fleet `PROJECT_STATUS.md` / dependency changes |
| Data refresh jobs | Manual GitHub Actions dispatches; automatic seed-popular scheduling is paused pending a provider-side row-read budget |
| Deploy | `pnpm deploy:cf` or manual `deploy.yml` dispatch; both attach the full Git SHA |
| Smoke | `pnpm test` + `pnpm build`; for search/DB changes also `pnpm db:migrate` and `pnpm build:cf` |

## Timeline

- **2026-08-02 (Cloudflare data cutover completed)** — Migrated 1,050,033
  relational rows from Turso to D1 with an exact frozen-source checksum match,
  moved 12,450 repository vectors to the 768d `starboard-repos` Vectorize
  index, and deployed SHA `cd5ffbd4d81a874389bfdabf4a63a75343b6ed54`
  at 100% traffic. Main CI, docs, deploy, D1/Vectorize operator smoke, and
  embedding backfill Actions pass; the pending embedding queue is zero. The
  retired Turso database was deleted on 2026-08-02 after acceptance.

- **2026-07-31 (GitHub stars organization guide)** — Replaced the thin About
  page with a visible and agent-readable guide that starts with GitHub's native
  lists, explains hybrid lexical and semantic search, gives an organization
  workflow, and states privacy and recommendation limits. The landing footer
  now exposes the guide.

- 2026-07-31: Pinned Next.js output tracing to the Starboard project root so
  Cloudflare standalone builds do not inherit the surrounding Fleet workspace.

- **2026-07-31 (landing semantics clarified)** — Promoted the visible
  flat-list problem statement into the homepage heading hierarchy without
  changing the landing copy, layout, routes, or sign-in flow.
- **2026-07-31 (large-library paths bounded)** — Profiled the 1,000-repo sync,
  virtual grid, collection/facet queries, and 2,000-candidate project
  recommendations without production data. Removed synchronous embedding
  generation from core sync, bounded immediate README fetches to 25 while
  retaining metadata-only RAG ingest for every added repo, and capped sync
  feedback at eight names plus a remaining count. Recommendation scoring
  measured 27.99 ms p95 across 30 warmed local runs.
- **2026-07-29 (owned product changelog)** — Added a same-origin
  `/changelog` with newest-first, user-visible outcomes drawn only from
  verified shipped milestones. The landing footer now exposes Changelog,
  routes Roadmap to GitHub Issues, and keeps Source on the canonical
  repository. No runtime, database, or deployment behavior changed.
- **2026-07-28 (Turso recurrence contained locally)** — The earlier fix removed
  correlated scans and explicit FTS rebuilds but missed unconditional
  `seed-popular` updates: the July 26 run rewrote 12,000 local corpus rows,
  firing FTS update maintenance even when metadata was unchanged. Automatic
  scheduling is now disabled; manual runs default to 10 metadata pages and
  hard-cap at 25; unchanged repos and unchanged star snapshots are skipped;
  FTS emptiness checks probe one row instead of counting the index; and legacy
  list/tag backfills use a durable one-time marker. These controls require
  the change on `main` to affect GitHub Actions; no Worker deployment is
  required.
- **2026-07-26 (deploy provenance hardened locally)** — Worker deploy
  entrypoints now attach the full Git SHA to the Cloudflare version, production
  remains manual, and current runbooks no longer claim that pushes deploy.
  Pending commit/push and the next operator-owned production deployment.
- **2026-07-25 (Turso row-read incident closed)** — The 486.6M/500M
  organization rows-read pressure was traced to Starboard: a missing
  `user_repos(repo_id)` index, correlated `OR EXISTS` eligibility filters, and
  unconditional FTS rebuilds in the daily migration path compounded into
  roughly 500M avoidable reads. Commit `08f5ad7` added the index, changed the
  filters to index-friendly `IN (SELECT ... UNION SELECT ...)` forms, guarded
  FTS rebuilds, and added regression tests. Read-only verification confirmed
  the index in the live Turso schema, successful post-fix scheduled seed runs,
  and an unchanged live counter across two checks on July 25. A separate
  transient libSQL server failure was fixed by bounded retry handling in
  `70d57ab`; its manual rerun completed all migration, seed, evidence, and tool
  enrichment steps. The remaining 97% reading is historical cycle usage and
  clears at the August 1 quota reset; no provider mutation was performed.
- **2026-07-25 (browser compatibility fix)** — Public Discover now loads its
  guest repository feed from `/discover/data`, retaining `/api/discover` for
  integrations while avoiding browser privacy tools that block generic
  `/api/*` requests. Its first result set is server-rendered into the document
  so guests still see the feed when a privacy tool blocks client-side JSON
  requests entirely. Removed stale auth-status guards from the guest content
  component.
- **2026-07-25 (ready to ship)** — Made Discover genuinely public for guests:
  unauthenticated reads use the shared seeded corpus, private list filters fail
  closed, personalized controls stay hidden, and the landing public CTA reaches
  `/discover`. Focused API tests, the full suite, typecheck, lint, production
  build, and local guest-shell browser verification pass. No production
  deployment was performed.
- **2026-07-13** — Completed Star History + Tool Intelligence: Discover now supports stored 30-day growth ordering and detected-tool facets, tool enrichment reuses persisted AI/README-derived metadata before GitHub manifest requests, and the 5k+ seed walk has a hard per-run page bound with conflict-safe snapshot inserts and resumable cursors. Added route-level coverage for growth/tool queries and excluded linked fleet agent assets from Vitest discovery; 94 tests, typecheck, lint, and production build pass.
- **2026-07-11** — Scheduled seed reliability: GitHub search now retries transient network and 5xx failures with bounded exponential backoff, while alert preference fixtures include the current email opt-out default.
- **2026-07-02** — Added global try/catch error handler to OpenNext worker (`worker.mjs`).

| Phase | Milestone |
|-------|-----------|
| Foundation | GitHub OAuth (NextAuth v5), OpenNext Cloudflare deploy, core dashboard with sync, tags, collections, full-text search, virtual scroll |
| Repo intelligence | Repo detail (`/explore`), comments/votes, public shared lists, legal/marketing shell |
| Semantic search | knowledgebase Worker integration for relevance search; README-backed sync ingest; local embeddings retained for non-RAG Starboard features |
| Fleet recommendations | My Projects scorer against `fleet-projects.generated.json`, fixture-backed eval harness, OSS integration evaluation |
| Discovery & radar | Discover page, manually dispatched seed/enrich/embed, radar maintainer signals, stack builder, first-run UX and digest preview surfaces |
| Alerts & reports | Weekly alert inbox/preferences, digest payloads, shareable insight reports at stable public URLs |
| Ops hardening (2026-06-20) | `.env.example`, Vitest + Playwright path, pre-push lint, self-contained TypeScript/Astro landing for green CF builds |

## Products

**Live:** [starboard.codevetter.com](https://starboard.codevetter.com)

**Primary routes:** `/stars` (dashboard) · `/explore/[...slug]` (repo detail) · `/discover` · `/projects` · `/projects/[slug]` · `/lists/[slug]` · `/radar` · `/reports/[slug]` · `/stack-builder` · `/tools`

**Primary API:** `/api/stars` · `/api/stars/sync` · `/api/repos/[repoId]/*` · `/api/lists/*` · `/api/projects/*` · `/api/radar` · `/api/growth` · `/api/tools` · `/api/alerts/*` · `/api/reports/*` · `/api/digest/weekly` · `/api/embeddings/generate`

| Surface | Role |
|---------|------|
| Dashboard | Starred-repo grid with filters, tags, collections, semantic + full-text search |
| My Projects | Fleet-aware repo recommendations against checked-in fleet snapshot |
| Discover | Seeded popular repositories |
| Radar | Maintainer/release signals |
| Alerts | Weekly inbox + digest payloads |
| Reports | Shareable read-only insight snapshots |
| Stack builder | Stack composition helper |
| Tool Intelligence | Tool/framework/platform usage across 10k+ repos and the user's library |

## Features (shipped)

### Auth, sync, and core dashboard
- GitHub OAuth through NextAuth v5; Cloudflare Workers deployment via OpenNext documented and live.
- Manual sync on demand with added/removed diff feedback; ETag caching on GitHub star API calls.
- GitHub star-list ingestion via HTML scraping where no official API exists.
- Main dashboard: smart categories, custom colored tags, named collections, full-text search, language/category/tag/collection filters, sort (recently starred, most stars, recently updated, A-Z), grid/list toggle, virtual scroll for 1000+ repos.
- URL-shareable filter/sort state through nuqs.
- Repo detail (`/explore`): comments, votes, likes, similar repos, list assignment, tag picker.
- Public shared lists at `/lists/[slug]` with SSR and `list.json` export route.
- Legal/marketing shell: about, privacy, terms, sitemap, robots, OG image, security.txt, humans.txt, PWA manifest.

### Search and embeddings
- Workers AI embedding generation with runtime dimension assertion.
- Project-owned Vectorize path (`starboard-repos`, 768d cosine) serves similar repos and recommendations; D1 `repo_embeddings` stores drift hashes.
- Shared-RAG integration: when `RAG_SERVICE_KEY` and `STARBOARD_RAG_INDEX_ID` are set as Worker secrets/vars or local env, relevance search uses the fleet `knowledgebase` Worker with sync ingest for new repos; each sync fetches README text for at most 25 new repos and uses metadata-only documents for every other added repo, with bounded ingest batches. `src/__tests__/knowledgebase-rag.test.ts` covers README-only recall terms plus batch splitting, and `src/__tests__/sync-performance.test.ts` fixes the large-import bound. If shared RAG is unavailable, relevance search falls back to lexical results instead of local vector search.
- Manual embedding backfills run through an authenticated Worker operator route
  so Workers AI, Vectorize, and D1 use native bindings without broad Vectorize
  credentials in GitHub.

### Fleet recommendations
- **My Projects** ranks saved/starred repos against checked-in fleet project snapshot (`data/fleet-projects.generated.json`).
- Deterministic scoring with optional embedding boosts; packages already in the target project suppressed before ranking.
- `pnpm fleet:extract-projects` regenerates fleet snapshot from local fleet repos.
- Fixture-backed recommendation eval harness: `src/lib/recommendation-eval.ts`, `src/__tests__/fixtures/recommendation-eval-fixture.ts`.
- OSS recommendation integrations evaluated in `docs/oss-integration-evaluation.md`.

### Discovery, radar, and intelligence surfaces
- Public Discover page and `/api/discover` for the seeded popular repository
  corpus; authentication adds saved state and collection controls but is not
  required to browse, search, sort, filter, paginate, or open repo details.
- Discover supports paginated 30-day growth ordering and detected-tool facets from indexed local snapshot/tool tables.
- Manually dispatched GitHub Actions seed/enrich popular repos in D1 and embed
  through native Worker bindings; automatic seeding remains paused pending an
  explicit operating budget.
- Radar page and `/api/radar` for maintainer/release-oriented signals.
- Star history and fastest-grower APIs/surfaces: `/api/repos/[repoId]/star-history`, `/api/growth`, Radar fastest-growers, and repo-detail mini history from stored `repo_star_snapshots`.
- Tool Intelligence: additive `repo_tools` index, `/api/tools`, `/api/repos/[repoId]/tools`, `/tools`, and `pnpm db:enrich-tools` for bounded SBOM/tree/manifest-based detection with source/confidence labels. Accuracy disclaimer is shown in-product because manifest/SBOM evidence is stronger than README/topic/metadata inference and C/C++ monorepos vary.
- Stack builder surface (`/stack-builder`, `/api/stack-builder`).
- SaaS Maker feedback widget integrated; product analytics run directly through PostHog.
- First-run UX, sample prioritized stars board, why-repo-is-hot explanations, GitHub permission trust note, stale-star cleanup proof, weekly digest preview surfaces (product/design loop shipped).

### Alerts and shareable reports
- Weekly repository alerts: opt-in lanes, in-app inbox (`/api/alerts/inbox`), preference API (`/api/alerts/preferences`).
- Weekly digest payload generation from radar/maintainer signals (`/api/alerts/weekly`, `/api/digest/weekly`).
- Shareable insight reports at stable public URLs (`/reports/[slug]`, `POST /api/reports`) for radar snapshots, project recommendation explanations, and cleanup digests.
- Share buttons wired on Radar, My Projects, and weekly cleanup digest flows.

### Ops and developer experience
- Checked-in `.env.example` documents required local variables without secrets.
- Vitest unit tests with v8 coverage thresholds (80% lines/functions/statements, 70% branches) on core logic modules (`src/lib/fleet-projects`, `recommendation-eval`, `search`, `stack-builder`, `starboard-rag-documents`, `release-radar`); Playwright e2e path documented in README.
- Pre-push lint hook.
- TypeScript config and Astro landing tooling made self-contained for green Cloudflare builds.

## Work queue

Open work is tracked only in [GitHub Issues](https://github.com/Codevetter/starboard/issues).
An open issue is a to-do, a linked pull request is in progress, and merge plus
issue closure makes the work done.
