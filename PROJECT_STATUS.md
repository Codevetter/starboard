# starboard — PROJECT STATUS

Last updated: 2026-06-20

## Why/What

Starboard turns a large GitHub star list into a searchable personal knowledge base. Active product surfaces: starred-repo dashboard with tags, collections, filters, and semantic search; fleet-aware **My Projects** recommendations; discovery and repo detail pages; radar maintainer signals; weekly alert inbox and digest payloads; and shareable read-only insight reports. Live: [starboard.sarthakagrawal927.workers.dev](https://starboard.sarthakagrawal927.workers.dev).

Out of scope: organization/team dashboards, non-GitHub providers, ATS features, and real-time push notifications.

## Dependencies

| Layer | Choice |
|-------|--------|
| App | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui, dark default |
| Data | Turso (libSQL) — raw SQL, no ORM |
| Auth | NextAuth v5 (GitHub OAuth, `read:user`) |
| Client state | SWR (data), nuqs (URL-backed filters/sort) |
| AI / search | Cloudflare Workers AI `@cf/baai/bge-base-en-v1.5` (768d); optional `knowledgebase` Worker via service binding |
| Deploy | Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`) |
| CI | GitHub Actions — push-to-main deploy + scheduled seed/enrich/embed |

**Local dev:** `pnpm install && cp .env.example .env.local && pnpm dev` → http://localhost:3000

**Key checks:** `pnpm test` · `pnpm build` · `pnpm build:cf` (Cloudflare path)

```
GitHub OAuth (NextAuth)
        │
        ▼
Star sync (ETag + HTML scrape for star lists) ──► Turso (users, repos, user_repos, tags, lists, comments, votes)
        │
        ├── Full-text + facet search (GET /api/stars)
        ├── Semantic search: knowledgebase Worker; lexical-only when shared RAG is unavailable
        ├── Fleet snapshot: data/fleet-projects.generated.json → My Projects scorer
        ├── Radar: maintainer/release signals → alert preferences + inbox
        └── Insight reports: slugged public snapshots (radar, recommendations, cleanup)
```

**Embedding contract:** `EMBEDDING_DIM=768` pinned across `src/lib/embeddings.ts`, `src/db/schema.sql`, and `src/db/migrate.ts` (`ensureEmbeddingDimension()` drops/recreates vector table on drift). Scheduled `db:migrate` before `db:seed-popular` heals dimension mismatches without manual surgery.

**Data model highlights:** tags stored as JSON arrays on `user_repos`; virtualized grid via `@tanstack/react-virtual`; GitHub access token in session for sync; project recommendations suppress packages already used by the target fleet project before ranking.

| Concern | Detail |
|---------|--------|
| Hosting | Cloudflare Worker `starboard` via OpenNext |
| Database | Turso — apply schema with `pnpm db:migrate` |
| Secrets | `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `TURSO_*`; `RAG_SERVICE_KEY`, `STARBOARD_RAG_INDEX_ID` for relevance RAG |
| Embedding model | `@cf/baai/bge-base-en-v1.5` — change model + dimension in all three contract files together |
| Fleet snapshot | Refresh `data/fleet-projects.generated.json` after fleet `PROJECT_STATUS.md` / dependency changes |
| Scheduled jobs | GitHub Actions seed-popular runs `db:migrate` then `db:seed-popular` — primary self-heal for vector dimension drift |
| Deploy | `pnpm deploy:cf` or push to `main` (CI auto-deploy) |
| Smoke | `pnpm test` + `pnpm build`; for search/DB changes also `pnpm db:migrate` and `pnpm build:cf` |

## Timeline

| Phase | Milestone |
|-------|-----------|
| Foundation | GitHub OAuth (NextAuth v5), OpenNext Cloudflare deploy, core dashboard with sync, tags, collections, full-text search, virtual scroll |
| Repo intelligence | Repo detail (`/explore`), comments/votes, public shared lists, legal/marketing shell |
| Semantic search | knowledgebase Worker integration for relevance search; local embeddings retained for non-RAG Starboard features |
| Fleet recommendations | My Projects scorer against `fleet-projects.generated.json`, fixture-backed eval harness, OSS integration evaluation |
| Discovery & radar | Discover page, scheduled seed/enrich/embed, radar maintainer signals, stack builder, first-run UX and digest preview surfaces |
| Alerts & reports | Weekly alert inbox/preferences, digest payloads, shareable insight reports at stable public URLs |
| Ops hardening (2026-06-20) | `.env.example`, Vitest + Playwright path, pre-push lint, self-contained TypeScript/Astro landing for green CF builds |

## Products

**Live:** [starboard.sarthakagrawal927.workers.dev](https://starboard.sarthakagrawal927.workers.dev)

**Primary routes:** `/stars` (dashboard) · `/explore/[...slug]` (repo detail) · `/discover` · `/projects` · `/projects/[slug]` · `/lists/[slug]` · `/radar` · `/reports/[slug]` · `/stack-builder`

**Primary API:** `/api/stars` · `/api/stars/sync` · `/api/repos/[repoId]/*` · `/api/lists/*` · `/api/projects/*` · `/api/radar` · `/api/alerts/*` · `/api/reports/*` · `/api/digest/weekly` · `/api/embeddings/generate`

| Surface | Role |
|---------|------|
| Dashboard | Starred-repo grid with filters, tags, collections, semantic + full-text search |
| My Projects | Fleet-aware repo recommendations against checked-in fleet snapshot |
| Discover | Seeded popular repositories |
| Radar | Maintainer/release signals |
| Alerts | Weekly inbox + digest payloads |
| Reports | Shareable read-only insight snapshots |
| Stack builder | Stack composition helper |

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
- Turso vector index path (`repo_embeddings`, cosine `libsql_vector_idx`) retained for non-RAG Starboard features such as similar repos, discover, and recommendations.
- Shared-RAG integration: when `RAG_SERVICE_KEY` and `STARBOARD_RAG_INDEX_ID` are set as Worker secrets/vars or local env, relevance search uses the fleet `knowledgebase` Worker with sync ingest for new repos; new repo RAG documents include GitHub README text when available, fall back to repo metadata when unavailable, and are sent in bounded ingest batches. If shared RAG is unavailable, relevance search falls back to lexical results instead of local vector search.
- `pnpm db:seed-embeddings` backfill script; embedding dimension guard in migrate runner.
- free-ai HTTP fallback for Node-based GitHub Actions embedding contexts.

### Fleet recommendations
- **My Projects** ranks saved/starred repos against checked-in fleet project snapshot (`data/fleet-projects.generated.json`).
- Deterministic scoring with optional embedding boosts; packages already in the target project suppressed before ranking.
- `pnpm fleet:extract-projects` regenerates fleet snapshot from local fleet repos.
- Fixture-backed recommendation eval harness: `src/lib/recommendation-eval.ts`, `src/__tests__/fixtures/recommendation-eval-fixture.ts`.
- OSS recommendation integrations evaluated in `docs/oss-integration-evaluation.md`.

### Discovery, radar, and intelligence surfaces
- Discover page and `/api/discover` for seeded popular repositories.
- Scheduled GitHub Actions seed/enrich/embed popular repos in Turso (`scripts/seed-popular.ts`, `pnpm db:seed-popular`).
- Radar page and `/api/radar` for maintainer/release-oriented signals.
- Stack builder surface (`/stack-builder`, `/api/stack-builder`).
- SaaS Maker feedback, testimonials, and changelog widgets integrated.
- First-run UX, sample prioritized stars board, why-repo-is-hot explanations, GitHub permission trust note, stale-star cleanup proof, weekly digest preview surfaces (product/design loop shipped).

### Alerts and shareable reports
- Weekly repository alerts: opt-in lanes, in-app inbox (`/api/alerts/inbox`), preference API (`/api/alerts/preferences`).
- Weekly digest payload generation from radar/maintainer signals (`/api/alerts/weekly`, `/api/digest/weekly`).
- Shareable insight reports at stable public URLs (`/reports/[slug]`, `POST /api/reports`) for radar snapshots, project recommendation explanations, and cleanup digests.
- Share buttons wired on Radar, My Projects, and weekly cleanup digest flows.

### Ops and developer experience
- Checked-in `.env.example` documents required local variables without secrets.
- Vitest unit tests; Playwright e2e path documented in README.
- Pre-push lint hook.
- TypeScript config and Astro landing tooling made self-contained for green Cloudflare builds.

## Todo / Planned / Deferred / Blocked

### Planned
1. **Scheduled Actions stability** — keep seed/enrich/embed and digest workflows green across Turso dimension changes and API rate limits.
2. **Recommendation scoring discipline** — tune production weights only when `recommendation-eval` fixture harness stays green across scorer changes.
3. **Weekly alert email delivery** — wire transactional email after in-app digest payloads prove stable in production (in-app first).
4. **Large-library performance** — profile sync, tag, collection, and project recommendation flows for users with 1000+ stars; optimize virtual scroll and API facet paths if needed.
5. **RAG path hardening** — verify knowledgebase binding ingest lag and lexical-only behavior under partial Worker outages.

### Deferred
- Organization/team dashboards and multi-user workspaces.
- General GitHub analytics beyond starred-repo rediscovery.
- Provider expansion beyond GitHub (npm, PyPI, etc.).
- Real-time push notifications for alerts (email/in-app digest first).
- Paid weekly intelligence productization beyond preview surfaces.

### Blocked / Known gaps
- Email delivery for weekly alerts is not wired — digest payloads and inbox exist; SMTP/Resend path is ops-owned next step.
- Recommendation scorer weights are fixture-validated but not yet tuned against large real-user libraries.
- GitHub HTML scraping for star lists is brittle to markup changes — monitor sync error rates.
- knowledgebase Worker dependency is optional; without it, `/api/stars` relevance search falls back to lexical-only results. Turso embeddings remain for non-RAG discover/similar/recommendation features.
