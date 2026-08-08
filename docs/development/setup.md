# Development Setup

## Prerequisites

- Node.js 22+ (CI uses 22).
- pnpm 10+ (the `packageManager` field pins the exact version).
- A Cloudflare account with the `starboard` Worker, D1, Vectorize, and Workers AI.
- A GitHub OAuth app (GitHub Developer Settings) with a redirect URI for
  `AUTH_URL` (e.g. `http://localhost:3000/api/auth/callback/github` in dev).

## Install

```bash
pnpm install
```

## Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` (see [../operations/env.md](../operations/env.md) for the full
list):

- `AUTH_SECRET` / `NEXTAUTH_SECRET` (`openssl rand -base64 32`)
- `GITHUB_ID`, `GITHUB_SECRET` (GitHub OAuth)
- `NEXTAUTH_URL` (e.g. `http://localhost:3000`)
- `AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY` (only needed for the Node/HTTP
  embedding path; the Worker uses the `AI` binding)
- Optional: `RAG_SERVICE_KEY`, `STARBOARD_RAG_INDEX_ID` for shared RAG search.

## Apply the schema

```bash
pnpm db:migrate        # applies migrations/* to isolated local D1
```

Vector dimension changes use a replacement index rather than schema self-heal — see
[../operations/runbooks/embedding-dimension-drift.md](../operations/runbooks/embedding-dimension-drift.md).

## Run

```bash
pnpm dev               # next dev → http://localhost:3000
```

For the Cloudflare build path (bindings, Workers AI):

```bash
pnpm preview:cf        # build:cf + opennextjs-cloudflare preview
```

## Common commands

See [commands.md](commands.md) for the full script map. The essentials:

```bash
pnpm typecheck         # tsc --noEmit
pnpm test              # vitest run
pnpm test:coverage     # vitest run --coverage
pnpm test:e2e          # playwright
pnpm lint              # biome check .
pnpm format            # biome format --write .
pnpm docs:check        # validate docs/ links + structure
pnpm docs:dev          # blume dev (local docs site; requires pnpm add -D blume)
pnpm docs:build        # blume build (presentation only; not part of production build)
```

## Landing page (Astro overlay)

```bash
pnpm --filter ./landing-astro dev
```

The landing is overlaid onto the OpenNext assets during `pnpm build:cf` via
`scripts/overlay-astro-landing.mjs` — see
[../operations/deploy.md](../operations/deploy.md).
