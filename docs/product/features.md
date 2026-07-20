# Features

Shipped feature inventory, grouped by surface. Source of truth for *what exists
today*; for *why* see [../architecture/decisions/](../architecture/decisions/).

## Auth, sync, and core dashboard

- GitHub OAuth through NextAuth v5; Cloudflare Workers deployment via OpenNext
  documented and live.
- Manual sync on demand with added/removed diff feedback; ETag caching on GitHub
  star API calls.
- GitHub star-list ingestion via HTML scraping where no official API exists.
- Main dashboard: smart categories, custom colored tags, named collections,
  full-text search, language/category/tag/collection filters, sort (recently
  starred, most stars, recently updated, A-Z), grid/list toggle, virtual scroll
  for 1000+ repos.
- URL-shareable filter/sort state through nuqs.
- Repo detail (`/explore`): comments, votes, likes, similar repos, list
  assignment, tag picker.
- Public shared lists at `/lists/[slug]` with SSR and `list.json` export route.
- Legal/marketing shell: about, privacy, terms, sitemap, robots, OG image,
  security.txt, humans.txt, PWA manifest.

## Search and embeddings

- Workers AI embedding generation with runtime dimension assertion.
- Turso vector index path (`repo_embeddings`, cosine `libsql_vector_idx`)
  retained for non-RAG Starboard features such as similar repos, discover, and
  recommendations.
- Shared-RAG integration: when `RAG_SERVICE_KEY` and `STARBOARD_RAG_INDEX_ID`
  are set as Worker secrets/vars or local env, relevance search uses the fleet
  `knowledgebase` Worker with sync ingest for new repos; new repo RAG documents
  include full GitHub README text when available, fall back to repo metadata
  when unavailable, and are sent in bounded ingest batches.
  `src/__tests__/knowledgebase-rag.test.ts` covers README-only recall terms plus
  batch splitting. If shared RAG is unavailable, relevance search falls back to
  lexical results instead of local vector search.
- `pnpm db:seed-embeddings` backfill script; embedding dimension guard in migrate
  runner.
- free-ai HTTP fallback for Node-based GitHub Actions embedding contexts.

## Fleet recommendations

- **My Projects** ranks saved/starred repos against checked-in fleet project
  snapshot (`data/fleet-projects.generated.json`).
- Deterministic scoring with optional embedding boosts; packages already in the
  target project suppressed before ranking.
- `pnpm fleet:extract-projects` regenerates fleet snapshot from local fleet
  repos.
- Fixture-backed recommendation eval harness: `src/lib/recommendation-eval.ts`,
  `src/__tests__/fixtures/recommendation-eval-fixture.ts`.
- OSS recommendation integrations evaluated in
  [../archive/oss-integration-evaluation.md](../archive/oss-integration-evaluation.md).

## Discovery, radar, and intelligence surfaces

- Discover page and `/api/discover` for seeded popular repositories.
- Discover supports paginated 30-day growth ordering and detected-tool facets
  from indexed local snapshot/tool tables.
- Scheduled GitHub Actions seed/enrich/embed popular repos in Turso
  (`scripts/seed-popular.ts`, `pnpm db:seed-popular`).
- Radar page and `/api/radar` for maintainer/release-oriented signals.
- Star history and fastest-grower APIs/surfaces: `/api/repos/[repoId]/star-history`,
  `/api/growth`, Radar fastest-growers, and repo-detail mini history from stored
  `repo_star_snapshots`.
- Tool Intelligence: additive `repo_tools` index, `/api/tools`,
  `/api/repos/[repoId]/tools`, `/tools`, and `pnpm db:enrich-tools` for bounded
  SBOM/tree/manifest-based detection with source/confidence labels. Accuracy
  disclaimer shown in-product.
- Stack builder surface (`/stack-builder`, `/api/stack-builder`).
- SaaS Maker feedback widget integrated; direct PostHog analytics.
- First-run UX, sample prioritized stars board, why-repo-is-hot explanations,
  GitHub permission trust note, stale-star cleanup proof, weekly digest preview
  surfaces.

## Alerts and shareable reports

- Weekly repository alerts: opt-in lanes, in-app inbox (`/api/alerts/inbox`),
  preference API (`/api/alerts/preferences`).
- Weekly digest payload generation from radar/maintainer signals
  (`/api/alerts/weekly`, `/api/digest/weekly`).
- Shareable insight reports at stable public URLs (`/reports/[slug]`,
  `POST /api/reports`) for radar snapshots, project recommendation explanations,
  and cleanup digests.
- Share buttons wired on Radar, My Projects, and weekly cleanup digest flows.

## Ops and developer experience

- Checked-in `.env.example` documents required local variables without secrets.
- Vitest unit tests with v8 coverage thresholds (80% lines/functions/statements,
  70% branches) on core logic modules; Playwright e2e path documented in
  README.
- Pre-push lint hook (Biome, changed-files only).
- TypeScript config and Astro landing tooling made self-contained for green
  Cloudflare builds.
- Documentation consolidation: `docs/` knowledge system + Blume presentation
  layer + `scripts/check-docs.mjs` validator + Docs CI. See
  [../development/](../development/).
