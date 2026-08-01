# Starboard

[![100% AI](https://img.shields.io/badge/Built%20with-100%25%20AI-blueviolet?style=for-the-badge)](https://claude.ai)
[![Live](https://img.shields.io/badge/Live-starboard.codevetter.com-black?style=for-the-badge)](https://starboard.codevetter.com)

Organize, search, and rediscover GitHub starred repositories. Starboard turns a
large star list into a searchable personal knowledge base with tags, lists,
semantic search, fleet project recommendations, and public share pages.

Live app: <https://starboard.codevetter.com>

## Product Shape

GitHub stars are useful intent signals, but the native GitHub UI is weak for
retrieval. Starboard syncs stars, enriches repository metadata, lets the user
organize repos with tags and collections, maps saved repositories to active
fleet projects, and uses embeddings to make semantic discovery possible across
both personal stars and seeded popular repositories.

## Deployment & External Services

| Concern | Service |
|---------|---------|
| Hosting | Cloudflare Workers (`starboard`) via `@opennextjs/cloudflare` |
| Database | Cloudflare D1; raw SQL, no ORM |
| Repository vectors | Cloudflare Vectorize (`starboard-repos`, 768-d cosine) |
| Auth | NextAuth v5 + GitHub OAuth |
| RAG search | Shared Cloudflare `knowledgebase` Worker for relevance search |
| AI | Cloudflare Workers AI binding for non-RAG embeddings; free-ai gateway fallback for Node-based GitHub Actions |
| CI/CD | GitHub Actions (`.github/workflows/deploy.yml`) — auto-deploy to Cloudflare on push to `main`; operator Actions use scoped D1/Vectorize APIs |

## Features

- **GitHub OAuth** — Sign in and sync your starred repos
- **Smart Categories** — Auto-categorize repos (AI/ML, Frontend, DevOps, etc.)
- **Custom Tags** — Create and assign colored tags to repos
- **Collections** — Group repos into named collections
- **Search** — Full-text search across name, description, and topics
- **Filter** — By language, category, tag, or collection
- **Sort** — Recently starred, most stars, recently updated, A-Z
- **My Projects** — Fleet-aware recommendations for current SaaS Maker projects
- **Grid / List Views** — Toggle between card grid and compact list
- **Dark Mode** — Dark by default
- **Virtual Scroll** — Smooth performance with 1000+ repos
- **Manual Sync** — Sync on demand, see what's added/removed

## Stack

- **Next.js 16** (App Router)
- **Tailwind CSS** + **shadcn/ui**
- **NextAuth v5** (GitHub OAuth)
- **Cloudflare D1** for relational data and FTS5
- **Cloudflare Vectorize** for repository embeddings
- **SWR** for client-side data fetching
- **nuqs** for URL-backed filter/sort state
- **@tanstack/react-virtual** for virtualized scrolling
- **Shared knowledgebase RAG** for relevance search; sync ingests README-backed repo documents when GitHub exposes a README
- **Cloudflare Workers AI** for non-RAG embeddings, with free-ai HTTP fallback in Node contexts

## Local Development

```bash
pnpm install
cp .env.example .env.local  # fill in your credentials
pnpm dev
```

The local app runs at <http://localhost:3000>.

## Environment Variables

```
AUTH_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
CLOUDFLARE_ACCOUNT_ID=
D1_DATABASE_ID=
CLOUDFLARE_API_TOKEN=
AUTH_TRUST_HOST=true
```

## Repository Layout

```text
src/app/stars/          main dashboard
src/app/explore/        repo detail and discovery pages
src/app/projects/       current fleet projects and repository recommendations
src/app/lists/          public shared list pages
src/app/api/            auth, stars, lists, repo interactions
src/components/         repo cards, grid, filters, pickers, shell
src/hooks/              SWR hooks
src/db/index.ts         Worker D1 binding adapter
src/db/rest-client.ts   authenticated D1 REST adapter for operator jobs
migrations/             ordered D1 SQL migrations
src/db/seed-embeddings.ts
scripts/seed-popular.ts scheduled popular repo seeding
scripts/extract-fleet-projects.ts local fleet snapshot generator
```

## Scripts

```bash
pnpm dev                 # Next.js dev server
pnpm build               # Next.js build
pnpm test                # Vitest unit tests
pnpm test:e2e            # Playwright e2e
pnpm db:migrate          # apply ordered SQL migrations to isolated local D1
pnpm db:migrate:remote   # apply to configured remote D1 (approval required)
pnpm db:seed-embeddings  # backfill repo embeddings
pnpm db:seed-popular     # seed/enrich popular repositories
pnpm fleet:extract-projects # refresh checked-in fleet project context snapshot
pnpm build:cf            # OpenNext Cloudflare build
pnpm preview:cf          # local Cloudflare preview
pnpm deploy:cf           # deploy to Cloudflare Workers
```

## Search And Embeddings

The embedding dimension is part of the Vectorize contract. The canonical model
is `@cf/baai/bge-base-en-v1.5` with 768 dimensions. If the model changes, update
the code and deliberately create/repopulate a replacement Vectorize index:

- `src/lib/embeddings.ts`
- Cloudflare Vectorize index configuration (`starboard-repos`, cosine)

D1 keeps only repository IDs and text hashes for drift detection; vector values
live in Vectorize.

## Operating Notes

- Use raw SQL through the D1 binding/REST adapters; there is no ORM in this repo.
- GitHub star sync uses ETag caching to avoid unnecessary API calls.
- GitHub star lists are scraped from GitHub HTML because there is no official API for that surface.
- My Projects reads the checked-in `data/fleet-projects.generated.json` snapshot. Refresh it locally with `pnpm fleet:extract-projects` after fleet project scope, dependencies, README, or `PROJECT_STATUS.md` changes.
- Project recommendations suppress packages already used by the target project before ranking candidate repos.
- Filter and sort state lives in the URL through `nuqs`, so dashboard links are shareable.
- Scheduled GitHub Actions seed and enrich popular repositories for discovery.
- SaaS Maker supplies the feedback widget only; product analytics run directly through PostHog.

## Verification

For most code changes, run:

```bash
pnpm test
pnpm build
```

For search, sync, database, or Cloudflare deployment changes, also run the
smallest relevant database script or Cloudflare build:

```bash
pnpm db:migrate
pnpm build:cf
```

<!-- ACTIVE-AI-TASK-LOG:START -->
## Active AI Task Log

This historical task ledger is retained for context; new planning and marketing automation live in Fleet Workspace.

- Business lane: P0 Can make money
- Rule: do not create another broad "improve the UI" task unless the acceptance criteria differ materially from the tasks listed here.
- Source of truth for current work: root `PROJECT_STATUS.md`; Fleet Workspace owns cross-project automation.

| Task | Status | Priority | Last known note |
| --- | --- | --- | --- |
| `9e6e8441` starboard: review and ship local onboarding UI change | done | medium | 2026-05-25 18:56:07 |
| `b019da19` starboard: first-run UX needs obvious value + GitHub sign-in CTA | done | medium | 2026-05-25 17:09:26 |
| `5c5f9479` starboard: show a sample prioritized stars board | done | high | 2026-05-26 |
| `e187b3a9` starboard: add why-this-repo-is-hot explanation | done | high | 2026-05-26 |
| `cd76368b` starboard: add weekly digest preview | done | high | 2026-05-26 |
| `5a0a8e62` starboard: add stale-star cleanup proof | done | medium | 2026-05-26 |
| `b3d3b34c` starboard: add GitHub permission trust note | done | medium | 2026-05-26 |
| `14253981` starboard: add paid weekly intelligence digest preview | done | high | 2026-05-26 |
| `ec12eae5` starboard: add paid weekly action preview | done | medium | 2026-05-27 |
<!-- ACTIVE-AI-TASK-LOG:END -->
