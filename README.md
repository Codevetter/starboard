# Starboard

[![100% AI](https://img.shields.io/badge/Built%20with-100%25%20AI-blueviolet?style=for-the-badge)](https://claude.ai)
[![Live](https://img.shields.io/badge/Live-starboard.workers.dev-black?style=for-the-badge)](https://starboard.sarthakagrawal927.workers.dev)

Organize, search, and rediscover GitHub starred repositories. Starboard turns a
large star list into a searchable personal knowledge base with tags, lists,
semantic search, and public share pages.

Live app: <https://starboard.sarthakagrawal927.workers.dev>

## Product Shape

GitHub stars are useful intent signals, but the native GitHub UI is weak for
retrieval. Starboard syncs stars, enriches repository metadata, lets the user
organize repos with tags and collections, and uses embeddings to make semantic
discovery possible across both personal stars and seeded popular repositories.

## Deployment & External Services

| Concern | Service |
|---------|---------|
| Hosting | Cloudflare Workers (`starboard`) via `@opennextjs/cloudflare` |
| Database | Turso (libSQL); raw SQL, no ORM |
| Auth | NextAuth v5 + GitHub OAuth |
| AI | Cloudflare Workers AI binding for embeddings; free-ai gateway fallback for Node-based GitHub Actions |
| CI/CD | GitHub Actions (`.github/workflows/deploy.yml`) — auto-deploy to Cloudflare on push to `main`; scheduled Actions seed/enrich/embed repos in Turso |

## Features

- **GitHub OAuth** — Sign in and sync your starred repos
- **Smart Categories** — Auto-categorize repos (AI/ML, Frontend, DevOps, etc.)
- **Custom Tags** — Create and assign colored tags to repos
- **Collections** — Group repos into named collections
- **Search** — Full-text search across name, description, and topics
- **Filter** — By language, category, tag, or collection
- **Sort** — Recently starred, most stars, recently updated, A-Z
- **Grid / List Views** — Toggle between card grid and compact list
- **Dark Mode** — Dark by default
- **Virtual Scroll** — Smooth performance with 1000+ repos
- **Manual Sync** — Sync on demand, see what's added/removed

## Stack

- **Next.js 16** (App Router)
- **Tailwind CSS** + **shadcn/ui**
- **NextAuth v5** (GitHub OAuth)
- **Turso** (libSQL edge database)
- **SWR** for client-side data fetching
- **nuqs** for URL-backed filter/sort state
- **@tanstack/react-virtual** for virtualized scrolling
- **Cloudflare Workers AI** for embeddings, with free-ai HTTP fallback in Node contexts

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
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
AUTH_TRUST_HOST=true
```

## Repository Layout

```text
src/app/stars/          main dashboard
src/app/explore/        repo detail and discovery pages
src/app/lists/          public shared list pages
src/app/api/            auth, stars, lists, repo interactions
src/components/         repo cards, grid, filters, pickers, shell
src/hooks/              SWR hooks
src/db/schema.sql       raw SQL schema
src/db/migrate.ts       migration runner and embedding dimension guard
src/db/seed-embeddings.ts
scripts/seed-popular.ts scheduled popular repo seeding
```

## Scripts

```bash
pnpm dev                 # Next.js dev server
pnpm build               # Next.js build
pnpm test                # Vitest unit tests
pnpm test:e2e            # Playwright e2e
pnpm db:migrate          # apply raw SQL schema to Turso
pnpm db:seed-embeddings  # backfill repo embeddings
pnpm db:seed-popular     # seed/enrich popular repositories
pnpm build:cf            # OpenNext Cloudflare build
pnpm preview:cf          # local Cloudflare preview
pnpm deploy:cf           # deploy to Cloudflare Workers
```

## Search And Embeddings

The embedding dimension is part of the database contract. The canonical model is
`@cf/baai/bge-base-en-v1.5` with 768 dimensions. If the model changes, update
these together:

- `src/lib/embeddings.ts`
- `src/db/schema.sql`
- `src/db/migrate.ts`

Do not hand-edit the Turso vector table. The migration path enforces dimension
drift and recreates embedding storage when needed.

## Operating Notes

- Use raw SQL through `@libsql/client`; there is no ORM in this repo.
- GitHub star sync uses ETag caching to avoid unnecessary API calls.
- GitHub star lists are scraped from GitHub HTML because there is no official API for that surface.
- Filter and sort state lives in the URL through `nuqs`, so dashboard links are shareable.
- Scheduled GitHub Actions seed and enrich popular repositories for discovery.
- SaaS Maker feedback, analytics, testimonials, and changelog widgets are integrated.

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
