# Starboard — Documentation Index

This folder is the canonical source of truth for Starboard's product,
architecture, operations, and durable knowledge. Markdown here is authoritative;
the [`blume.config.ts`](../blume.config.ts) at the repo root only renders it.

For a fast agent briefing, read [AGENTS.md](../AGENTS.md) first, then this index.

## Where to start

- **New to the codebase?** → [product/overview.md](product/overview.md) →
  [product/features.md](product/features.md) →
  [architecture/overview.md](architecture/overview.md) →
  [development/setup.md](development/setup.md)
- **Deploying / on-call?** → [operations/deploy.md](operations/deploy.md) →
  [operations/runbooks/](operations/runbooks/)
- **Why is X the way it is?** → [architecture/decisions/](architecture/decisions/)
  → [knowledge/learnings.md](knowledge/learnings.md)
- **What broke before?** →
  [knowledge/failed-approaches.md](knowledge/failed-approaches.md) →
  [archive/](archive/)
- **Current state of the project?** → [STATUS.md](../STATUS.md) →
  [PROJECT_STATUS.md](../PROJECT_STATUS.md)
- **Writing code here?** → [development/conventions.md](development/conventions.md)
  → [development/commands.md](development/commands.md) →
  [development/testing.md](development/testing.md) →
  [development/openspec.md](development/openspec.md)
- **Scheduled jobs / ops?** → [operations/jobs.md](operations/jobs.md) →
  [operations/ci-cd.md](operations/ci-cd.md) → [operations/env.md](operations/env.md)
  → [operations/data-map.md](operations/data-map.md) (data classification +
  reconstruction + refresh controls)
- **Marketing the product?** → [marketing/hooks.md](marketing/hooks.md) →
  [marketing/iterations/v2/write-founder-launch-note.md](marketing/iterations/v2/write-founder-launch-note.md)
  → [marketing/iterations/v2/write-reddit-safe-launch-draft.md](marketing/iterations/v2/write-reddit-safe-launch-draft.md)
  → [marketing/iterations/v2/add-screenshot-shot-list.md](marketing/iterations/v2/add-screenshot-shot-list.md)

## Layout

```
docs/
  index.md                      # this file
  product/
    overview.md                 # purpose, users, scope
    features.md                 # shipped feature inventory
    surfaces.md                 # production URLs, API routes, agent surfaces
  architecture/
    overview.md                 # Next.js + OpenNext + Turso + Workers AI shape
    data-flow.md                # sync, search, recommendation lifecycles
    decisions/                  # ADRs (one file per decision)
      index.md
      0001-deploy-vercel-to-cloudflare-workers.md
      0002-nextauth-v5-beta.md
      0003-opennext-libsql-bundling.md
      0004-turso-f32-blob-vectors.md
      0005-cf-workers-ai-binding-vs-http-gateway.md
      0006-embedding-dimension-contract.md
      0007-similar-repos-reranking.md
      0008-hybrid-rrf-search.md
  development/
    setup.md                    # local dev environment
    commands.md                 # pnpm scripts and what they do
    conventions.md              # code style, formatting, pre-push hook
    testing.md                  # vitest + playwright + eval harness
    openspec.md                 # spec-driven change workflow
  operations/
    deploy.md                   # Cloudflare Workers deploy + secrets
    env.md                      # environment variables and validation
    ci-cd.md                    # GitHub Actions workflows
    jobs.md                     # scheduled jobs (seed/enrich/embed/digest)
    data-map.md                 # authoritative vs derived data, reconstruction, refresh controls
    refresh-manifest.md         # schema + quality gate for data/refresh-manifest.json
    foundry.md                  # Foundry snapshot sanitization contract
    experiments.md              # bounded Toolbox marketing experiment manifest
    runbooks/
      embedding-dimension-drift.md
      migrate-schema.md
      rotate-secrets.md
      rollback.md
  knowledge/
    learnings.md                # current, applicable engineering lessons
    external-references.md      # curated external docs (one entry per concept)
    failed-approaches.md        # approaches tried and abandoned, with reasons
  archive/                      # historical records, preserved verbatim
    index.md
  marketing/                    # landing/SEO copy iterations (current)
    hooks.md
    iterations/v2/
```

## Maintenance rules

1. **Markdown in `docs/` is the source of truth.** Code and executable config
   remain authoritative for implementation details; docs explain *why*, not
   *what the code does line-by-line*.
2. **One home per fact.** Don't duplicate a fact across files — link to its
   canonical home. If a fact moves, update links rather than copying.
3. **Prefer `archive/` over deletion.** When a doc is superseded, move it to
   `docs/archive/` with `git mv`, give it a dated filename, and prepend a
   one-line historical marker pointing at the current canonical doc. Preserve
   git rename history.
4. **Mark unresolved questions explicitly** with `TBD:` or an "Open questions"
   section. Do not invent answers.
5. **Keep pages focused** (150–300 lines). Split when a page grows beyond
   that.
6. **Validate before commit.** Run `pnpm docs:check` (or
   `node scripts/check-docs.mjs`) — it catches broken links, missing required
   sections, and files outside the canonical structure. CI runs it in
   `.github/workflows/docs.yml`.
7. **Blume is presentation only.** `blume.config.ts` renders `docs/`; never
   edit generated Blume output. Edit the Markdown and rebuild.

## What lives outside this folder

- [`AGENTS.md`](../AGENTS.md) — concise agent bootloader (purpose, commands,
  constraints, navigation). Links here for depth.
- [`STATUS.md`](../STATUS.md) — short current-state view (objective, active
  work, blockers, next steps).
- [`PROJECT_STATUS.md`](../PROJECT_STATUS.md) — deeper product status (fleet
  tooling reads this filename).
- [`README.md`](../README.md) — product readme for humans landing in the repo.
- [`openspec/`](../openspec/) — spec-driven change workflow tooling and
  archived change proposals. See
  [development/openspec.md](development/openspec.md).
- [`public/`](../public/) — runtime agent-indexing surfaces (`llms.txt`,
  `index.md`, `api-ai.json`, `robots.txt`, `sitemap.xml`) served by the Worker.
  Documented in [product/surfaces.md](product/surfaces.md).
