# starboard — PROJECT STATUS

Last updated: 2026-08-09

## Why/What

Starboard is project-aware tool intelligence for GitHub: connect a public
project, discover relevant open-source repositories with visible evidence, and
keep a searchable personal library of starred repositories. The focused product
has removed Fleet project coupling, Alerts, Reports, Stack Builder, standalone
Radar, and weekly digest. Live at
[starboard.codevetter.com](https://starboard.codevetter.com), the current
release adds public project preview, full-catalog hybrid retrieval, and a
GitHub project picker.

Out of scope: private repositories until the permission model is chosen,
organization/team dashboards, non-GitHub providers, automated dependency
installation, alerts, reports, digest email, and stack generation.

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
| CI | GitHub Actions — push CI + manual SHA-tagged deploy + daily bounded seed/enrich/embed |

**Local dev:** `pnpm install && cp .env.example .env.local && pnpm dev` → http://localhost:3000

**Key checks:** `pnpm test:coverage` · `pnpm build` · `pnpm build:cf` (Cloudflare path)

```
GitHub OAuth (NextAuth)
        │
        ▼
Star sync + public project connection ──► D1 (users, repos, user_repos, user_projects, lists, comments, votes)
        │
        ├── Full-text + facet search (GET /api/stars)
        ├── Semantic search: knowledgebase Worker; lexical-only when shared RAG is unavailable
        ├── Public catalog + repo_tools → Discover and Tool Intelligence
        └── Public preview or connected project context
              → Vectorize + FTS + language candidates
              → deterministic evidence reranking
              → explained repository and tool recommendations
```

**Embedding contract:** `EMBEDDING_DIM=768` in `src/lib/embeddings.ts` matches the `starboard-repos` Vectorize index. D1 stores only repository IDs and text hashes; dimension changes require a deliberate replacement index and re-embedding.

**Data model highlights:** tags stored as JSON arrays on `user_repos`;
`user_projects` connects a user to a shared public `repos` row; tool evidence
lives in `repo_tools`; similar-project retrieval combines bounded Vectorize,
full-catalog FTS, and language candidates before visible language, topic,
metadata, and tool reranking with explicit fallback labeling. Additional tools
are recommended only when detected in those grounded peers, with repository
provenance. The workflow is free and has no billing or entitlement gate.

| Concern | Detail |
|---------|--------|
| Hosting | Cloudflare Worker `starboard` via OpenNext |
| Database | Cloudflare D1 `starboard` — apply ordered schema with `pnpm db:migrate:remote` |
| Secrets | `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`; `AI_GATEWAY_API_KEY` for authenticated operator jobs; `RAG_SERVICE_KEY` for relevance RAG. Any legacy unused `TURSO_*` bindings are separate credential-cleanup work. |
| Embedding model | `@cf/baai/bge-base-en-v1.5` — change model, dimension, and replacement Vectorize index together |
| Project connections | Additive `0003_user_projects.sql`; remote migration requires explicit approval before application rollout |
| Data refresh jobs | Daily bounded `seed-popular` at 03:00 UTC plus manual seed/enrich/embed dispatches |
| Deploy | `pnpm deploy:cf` or manual `deploy.yml` dispatch; both attach the full Git SHA |
| Smoke | `pnpm test` + `pnpm build`; for search/DB changes also `pnpm db:migrate` and `pnpm build:cf` |

## Timeline

- **2026-08-09 (shared lint baseline)** — Adopted the Fleet Ultracite baseline
  for core TypeScript, React, Next.js, and Vitest code. Explicit compatibility
  exceptions preserve current behavior while 206 files pass with zero
  diagnostics; generated Worker, public, Astro, and build artifacts remain
  outside the checked surface.
- **2026-08-09 (project-value hardening released)** — Archived the
  completed project-focus change after syncing its delta specs. Replaced the
  500-most-starred recommendation pool with bounded hybrid candidate retrieval
  across the eligible catalog, added a read-only public project preview and
  on-demand GitHub public-repository picker, made login project-first, and
  replaced digest-era analytics with identity-free recommendation evidence.
  Tests, typecheck, lint, docs, strict OpenSpec validation, and the production
  Cloudflare build pass.

- **2026-08-08 (free project discovery shipped)** — Removed Alerts,
  Reports, Stack Builder, standalone Radar, weekly digest, and the checked-in
  Fleet project catalog. Added user-owned public GitHub project connections and
  deterministic similar-project grounding plus repository-sourced tool
  recommendations without broadening OAuth scope. The product is explicitly
  free, and selective core-logic coverage is locked at 100% across statements,
  branches, functions, and lines. D1 migration `0003_user_projects.sql` is
  applied; the release first reached 100% traffic at Worker SHA
  `13c5bfa097c00701381707d2704528cf2d532c35`. Daily bounded catalog refresh
  was restored after the D1 cutover; manual dispatch remains available for
  operator checks.

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
| Connected projects | Shipped public GitHub project connections, public preview, GitHub picker, and evidence-based repository and tool recommendations |
| Discovery & tools | Public Discover, daily bounded seed/enrich/embed with manual dispatch, stored growth sorting, and Tool Intelligence |
| Removed 2026-08-08 | Fleet project catalog, Alerts, Reports, Stack Builder, standalone Radar, weekly digest |
| Ops hardening (2026-06-20) | `.env.example`, Vitest + Playwright path, pre-push lint, self-contained TypeScript/Astro landing for green CF builds |

## Products

**Live:** [starboard.codevetter.com](https://starboard.codevetter.com)

**Primary routes:** `/stars` (library) · `/explore/[...slug]` (repo detail) ·
`/discover` · `/project-preview` · `/projects` · `/projects/[slug]` ·
`/lists/[slug]` · `/tools`

**Primary API:** `/api/stars` · `/api/stars/sync` ·
`/api/repos/[repoId]/*` · `/api/lists/*` · `/api/project-preview` ·
`/api/projects/*` · `/api/github/projects` · `/api/growth` · `/api/tools` ·
`/api/embeddings/generate`

| Surface | Role |
|---------|------|
| Dashboard | Starred-repo grid with filters, tags, collections, semantic + full-text search |
| Projects | Connect public GitHub repositories, inspect similar peers, and trace recommended tools to those repositories |
| Discover | Seeded popular repositories |
| Tool Intelligence | Tool/framework/platform usage across 10k+ repos and the user's library |

## Features

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
- Project-owned Vectorize path (`starboard-repos`, 768d cosine) serves similar repos; D1 `repo_embeddings` stores drift hashes.
- Shared-RAG integration: when `RAG_SERVICE_KEY` and `STARBOARD_RAG_INDEX_ID` are set as Worker secrets/vars or local env, relevance search uses the fleet `knowledgebase` Worker with sync ingest for new repos; each sync fetches README text for at most 25 new repos and uses metadata-only documents for every other added repo, with bounded ingest batches. `src/__tests__/knowledgebase-rag.test.ts` covers README-only recall terms plus batch splitting, and `src/__tests__/sync-performance.test.ts` fixes the large-import bound. If shared RAG is unavailable, relevance search falls back to lexical results instead of local vector search.
- Manual embedding backfills run through an authenticated Worker operator route
  so Workers AI, Vectorize, and D1 use native bindings without broad Vectorize
  credentials in GitHub.

### Connected projects and public preview
- Guests can preview a public GitHub repository without sign-in or a user-data
  write, then carry the normalized repository through sign-in for explicit
  connection.
- Authenticated users can connect and disconnect public GitHub repositories
  by URL or an on-demand public-repository picker without a broader OAuth scope.
- `user_projects` isolates project connections per user while reusing shared
  repository metadata.
- Bounded Vectorize, full-catalog FTS, and language candidates feed deterministic
  recommendations that explain language, topic, metadata, and tool matches;
  sparse context is labeled as broad discovery.

### Discovery and intelligence surfaces
- Public Discover page and `/api/discover` for the seeded popular repository
  corpus; authentication adds saved state and collection controls but is not
  required to browse, search, sort, filter, paginate, or open repo details.
- Discover supports paginated 30-day growth ordering and detected-tool facets from indexed local snapshot/tool tables.
- Daily bounded GitHub Actions seed/enrich popular repos in D1 and embed through
  native Worker bindings; manual dispatch remains available for operator checks.
- Star history and fastest-grower APIs/surfaces: `/api/repos/[repoId]/star-history`, `/api/growth`, Discover growth sorting, and repo-detail mini history from stored `repo_star_snapshots`.
- Tool Intelligence: additive `repo_tools` index, `/api/tools`, `/api/repos/[repoId]/tools`, `/tools`, and `pnpm db:enrich-tools` for bounded SBOM/tree/manifest-based detection with source/confidence labels. Accuracy disclaimer is shown in-product because manifest/SBOM evidence is stronger than README/topic/metadata inference and C/C++ monorepos vary.
- SaaS Maker feedback widget integrated; product analytics run directly through PostHog.
- First-run UX, sample prioritized stars board, semantic search, GitHub
  permission trust note, and public discovery paths remain.

### Ops and developer experience

- Shared Ultracite lint baseline with a clean 206-file check.
- Checked-in `.env.example` documents required local variables without secrets.
- Vitest unit tests with v8 coverage thresholds (80% lines/functions/statements, 70% branches) on `github-projects`, `project-recommendations`, `search`, and `starboard-rag-documents`; Playwright e2e path documented in README.
- Pre-push lint hook.
- TypeScript config and Astro landing tooling made self-contained for green Cloudflare builds.

## Work queue

Open work is tracked only in [GitHub Issues](https://github.com/Codevetter/starboard/issues).
An open issue is a to-do, a linked pull request is in progress, and merge plus
issue closure makes the work done.
