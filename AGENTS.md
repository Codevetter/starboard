# AGENTS.md — Starboard

> Agent bootloader. Concise by design — links to [`docs/`](docs/index.md) for
> depth. Also follow the shared fleet standard at [`../AGENTS.md`](../AGENTS.md):
> treat this repository as owned product code, protect production stability,
> keep changes scoped, verify work, and record durable follow-up tasks when
> something remains incomplete or blocked.

## Purpose

GitHub stars organizer — sync, tag, and semantic vector search across your
starred repositories. Fleet-aware recommendations, discovery, radar, alerts,
and shareable insight reports. Live at
[starboard.codevetter.com](https://starboard.codevetter.com). See
[docs/product/overview.md](docs/product/overview.md).

## Stack (one-liner)

Next.js 16 (App Router, React 19) + TypeScript, Turso (libSQL, raw SQL — no ORM)
with `F32_BLOB(768)` vectors, NextAuth v5 beta (GitHub OAuth), nuqs + SWR,
Cloudflare Workers AI `@cf/baai/bge-base-en-v1.5`, deployed to Cloudflare
Workers via `@opennextjs/cloudflare`. pnpm.

## Essential commands

```bash
pnpm install
pnpm dev               # next dev → http://localhost:3000
pnpm build             # next build --webpack
pnpm build:cf          # OpenNext Cloudflare build (production path)
pnpm deploy:cf         # build:cf + wrangler deploy (manual; CI auto-deploys on push to main)
pnpm typecheck         # tsc --noEmit
pnpm test              # vitest run
pnpm test:coverage     # vitest run --coverage
pnpm test:e2e          # playwright
pnpm lint              # biome check .
pnpm db:migrate        # tsx src/db/migrate.ts (applies schema.sql + embedding dim self-heal)
pnpm db:seed-popular   # cold-seed popular repos (≥5k stars) — used by daily GH Action
pnpm db:seed-embeddings# backfill repo_embeddings
pnpm fleet:extract-projects  # regenerate data/fleet-projects.generated.json
pnpm docs:check        # validate docs/ links + structure
pnpm docs:dev          # blume dev (local docs site; requires pnpm add -D blume)
pnpm docs:build        # blume build (presentation only; not part of production build)
```

Full command map: [docs/development/commands.md](docs/development/commands.md).

## Critical constraints

- **Do not commit secrets.** `.env`, `.env.local`, `.dev.vars` are gitignored.
  Verify `.gitignore` before any push.
- **Do not push, deploy, run migrations, or open PRs without explicit user
  approval.** Make changes locally and leave them staged/committed for review.
- **Embedding dimension contract** — `EMBEDDING_DIM=768` is pinned across three
  files that must change together: `src/lib/embeddings.ts`,
  `src/db/schema.sql`, `src/db/migrate.ts`. The migrate runner self-heals drift
  (`ensureEmbeddingDimension()`); do not hand-edit the Turso `repo_embeddings`
  table. See
  [docs/architecture/decisions/0006-embedding-dimension-contract.md](docs/architecture/decisions/0006-embedding-dimension-contract.md)
  and
  [docs/operations/runbooks/embedding-dimension-drift.md](docs/operations/runbooks/embedding-dimension-drift.md).
- **`@libsql/client/web` import is load-bearing.** `src/db/index.ts` must import
  from `@libsql/client/web` (not `@libsql/client`) and lazy-init via a Proxy.
  Using the default import re-breaks the Worker. The CF build must use
  `--webpack` (not Turbopack). See
  [docs/architecture/decisions/0003-opennext-libsql-bundling.md](docs/architecture/decisions/0003-opennext-libsql-bundling.md).
- **NextAuth v5 beta** — `trustHost: true` is hardcoded in `src/lib/auth.ts`
  (env-driven `AUTH_TRUST_HOST` was unreliable). Both `AUTH_URL` and
  `NEXTAUTH_URL` must be set in `wrangler.jsonc` vars. See
  [docs/architecture/decisions/0002-nextauth-v5-beta.md](docs/architecture/decisions/0002-nextauth-v5-beta.md).
- **No ORM.** Raw SQL via `@libsql/client`. Schema in `src/db/schema.sql`;
  apply with `pnpm db:migrate`.
- **Generated files — do not hand-edit:** `agent-edge.mjs`, `worker.mjs`,
  `cloudflare-env.d.ts`, `data/fleet-projects.generated.json`. See
  [docs/development/conventions.md](docs/development/conventions.md).
- **Pre-push hook** (`.husky/pre-push`) runs Biome on changed files and scans
  tracked files for common secret patterns. Re-stage modified files and retry.
- **Do not modify agent skills, plugins, or agent-profile directories**
  (`.claude/`, `.codex/`, `.symphony/`, `.clawpatch/`, any `SKILL.md`). They are
  tooling, not product code.

## Documentation navigation

- **[docs/index.md](docs/index.md)** — canonical documentation hub. Start there.
- **[STATUS.md](STATUS.md)** — short current-state view (objective, active work,
  blockers, next steps).
- **[PROJECT_STATUS.md](PROJECT_STATUS.md)** — deeper product status (fleet
  tooling reads this filename).
- **[README.md](README.md)** — product readme for humans landing in the repo.
- **[docs/product/](docs/product/)** — purpose, features, surfaces.
- **[docs/architecture/](docs/architecture/)** — overview, data flow, ADRs.
- **[docs/development/](docs/development/)** — setup, commands, conventions,
  testing, OpenSpec.
- **[docs/operations/](docs/operations/)** — deploy, env, CI/CD, jobs, runbooks.
- **[docs/knowledge/](docs/knowledge/)** — current lessons, external references,
  failed approaches.
- **[docs/archive/](docs/archive/)** — historical records (pre-split ADRs,
  plans, retros, security audit, OSS evaluation).
- **[openspec/](openspec/)** — spec-driven change workflow tooling and archived
  change proposals. See [docs/development/openspec.md](docs/development/openspec.md).
- **[public/](public/)** — runtime agent-indexing surfaces (`llms.txt`,
  `index.md`, `api-ai.json`, `robots.txt`, `sitemap.xml`). See
  [docs/product/surfaces.md](docs/product/surfaces.md).

## Documentation-maintenance rules

1. **Markdown in `docs/` is the source of truth.** Code and executable config
   remain authoritative for implementation details; docs explain *why*, not
   *what the code does line-by-line*.
2. **One home per fact.** Don't duplicate — link to the canonical home. If a
   fact moves, update links rather than copying.
3. **Prefer `docs/archive/` over deletion.** Move superseded docs with `git mv`,
   give them a dated filename, and prepend a one-line historical marker pointing
   at the current canonical doc. Preserve git rename history.
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

## Repo structure (high level)

```
src/
  app/                    # Next.js App Router: stars, explore, discover, projects, lists, radar, reports, api/*
  components/             # repo-card, repo-grid (virtualized), sidebar, top-bar, tag/list pickers
  hooks/                  # SWR data hooks
  db/                     # index.ts (Turso client), schema.sql, migrate.ts, seed-embeddings.ts
  lib/                    # github, github-lists, embeddings, auth, search, knowledgebase, fleet-projects, ...
docs/                     # Canonical documentation (source of truth)
scripts/                  # seed-popular, enrich-repos, enrich-tools, weekly-threshold-digest, check-docs, ...
landing-astro/            # Astro landing page (overlaid into OpenNext assets during build:cf)
openspec/                 # spec-driven change workflow tooling + archived changes
public/                   # Agent-indexing surfaces (llms.txt, index.md, api-ai.json, robots.txt, sitemap.xml)
data/fleet-projects.generated.json   # checked-in fleet snapshot for My Projects
wrangler.jsonc            # Worker config: main=worker.mjs, ASSETS + AI + RAG_SERVICE bindings
worker.mjs / agent-edge.mjs         # OpenNext-generated (do not hand-edit)
```

Detailed file map: [docs/architecture/overview.md](docs/architecture/overview.md).

## Fleet guidance

<!-- FLEET-GUIDANCE:START -->

### Adding Tasks

- Add durable work items in SaaS Maker Cockpit Tasks when the task affects
  product behavior, deployment, user feedback, or fleet maintenance.
- Include the project slug, a concise title, acceptance criteria,
  priority/status, and links to relevant code, issues, traces, or dashboards.
- If task discovery starts locally in an editor or agent session, mirror the
  durable next step back into SaaS Maker before handoff.

### Using SaaS Maker

- Treat SaaS Maker as the system of record for project metadata, feedback,
  tasks, analytics, testimonials, changelog, and fleet visibility.
- Prefer API-first workflows through `fnd api`, the SDK, or widgets instead of
  one-off scripts when interacting with SaaS Maker features.
- Keep this agent file aligned with the project record when operating rules,
  integrations, or deployment conventions change.

### Free AI First

- Prefer free/local AI paths for routine development and analysis: the
  `free-ai` gateway, local models, provider free tiers, and cached context.
- Escalate to paid models only when complexity, correctness risk, or missing
  capability justifies the cost.
- Note any paid-AI use in the task or handoff when it materially affects cost,
  reproducibility, or future maintenance.

<!-- FLEET-GUIDANCE:END -->

## Active context


<claude-mem-context>
# Memory Context

# [starboard] recent context, 2026-05-02 2:45pm GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (15,799t read) | 283,794t work | 94% savings

### Apr 25, 2026
58 5:48a 🔵 Starboard test suite: 5 pass, 9 skip after all search improvements
59 " 🔵 Pre-existing ESLint circular structure crash in starboard
60 5:50a 🔵 Starboard test suite structure — 2 test files in src/__tests__
61 " 🔵 search-integration.test.ts semantic relevance tests use live Turso vector search
62 5:51a 🔄 RRF fusion extracted to src/lib/search.ts utility
63 " 🟣 New search.test.ts added — unit tests for rrfFuse and cosineSimilarity
64 " ✅ Vitest suite grows from 5 to 16 passing tests after search.test.ts added
65 " 🟣 search-integration.test.ts extended with similar-repos and lexical NOCASE integration tests
66 5:52a 🔴 vitest.config.ts double-comma syntax error breaks vitest startup
S39 Add tests for new starboard search code — rrfFuse, cosineSimilarity, and similar-repos integration (Apr 25 at 5:52 AM)
S42 Global search / discovery feature design — extending AI search beyond user's own starred repos to a public discovery feed (Apr 25 at 5:52 AM)
S43 External repo sourcing strategy for Starboard AI search — planning discussion on expanding beyond user-starred repos (Apr 25 at 5:54 AM)
S44 Starboard sync architecture investigation + GH Search proxy design for discover page enrichment (Apr 25 at 5:55 AM)
S45 Daily GitHub Action planned for incremental popular-repo embedding seeding (Apr 25 at 5:56 AM)
67 5:59a ⚖️ Daily GitHub Action planned for incremental popular-repo embedding seeding
S46 Design cold-seed strategy for Starboard repo embeddings with MIN_STARS_FLOOR=5000 threshold (Apr 25 at 5:59 AM)
S54 Implement daily GH Action to cold-seed popular repos (≥5k stars) into Starboard's Turso DB with embeddings (Apr 25 at 5:59 AM)
68 6:00a 🟣 seed_cursor table added to Starboard schema
69 6:01a 🔵 Existing seed-embeddings.ts pattern for Starboard embedding pipeline
70 " 🟣 scripts/seed-popular.ts — two-phase GH repo cold-seeder implemented
71 6:02a ⚖️ seed-popular.ts redesigned: unified walk replaces two-phase cold_seed/maintenance split
72 6:03a 🔄 seed-popular.ts: runColdSeed + runMaintenance collapsed into single walkAndUpsert()
73 " ✅ seed_cursor schema: phase column removed, comment updated
74 " 🟣 GitHub Actions workflow seed-popular.yml created for daily repo seeding
75 6:04a ✅ seed:popular npm script added; workflow uses script alias
76 " 🔵 migrate.ts applies schema.sql wholesale — seed_cursor table lands via existing migration path
S58 Daily GH Action to cold-seed popular repos (≥5k stars) into Starboard Turso DB — full implementation complete and ready to ship (Apr 25 at 6:04 AM)
77 6:05a ✅ GH search inter-page delay increased from 1500ms to 2100ms
S59 Starboard migration feasibility: Next.js app on Cloudflare Workers via @opennextjs/cloudflare (Apr 25 at 6:05 AM)
78 6:09a ⚖️ Starboard database migration decision — Turso → Cloudflare D1
79 6:10a 🟣 Starboard CF migration — opennext + wrangler installed
81 " 🟣 Starboard wrangler.jsonc + open-next.config.ts created for CF deployment
82 " 🔄 embeddings.ts — dual-path AI: Workers binding + HTTP gateway fallback
83 6:11a 🔄 generateEmbeddings() wired to dual-path adapter — CF binding preferred, HTTP fallback
84 " ✅ Starboard package.json — CF build/deploy/preview/typegen scripts added
85 6:12a ✅ next.config.ts — opennext dev init wired for local CF binding access
86 " 🟣 cloudflare-env.d.ts generated — full CF binding types for Starboard
87 6:13a 🔵 Starboard CF build fails — missing component files block next build
89 " 🟣 Starboard CF build succeeds — opennext bundle ready for Workers deploy
90 6:14a ✅ .gitignore updated — CF build artifacts and generated types excluded
91 " 🔵 Starboard post-CF-migration state — tsc deprecation warning, all tests pass
92 " 🔴 tsconfig.json — deprecated baseUrl removed, tsc now clean
S69 Starboard — migrate deployment from Vercel/Turso to Cloudflare Workers via opennextjs-cloudflare (Apr 25 at 6:14 AM)
93 6:17a 🔵 Starboard prod env vars discovered via Vercel pull
94 6:18a ✅ Starboard CF Worker secrets configured via wrangler bulk push
95 6:19a 🔴 Starboard Turso schema migration fixed — tsx not found via --import flag
96 6:20a 🟣 Starboard deployed to Cloudflare Workers — live at workers.dev URL
97 " 🔵 Starboard Worker 500s traced to OpenNext layer, not CF runtime
99 6:23a 🔵 wrangler tail produces empty output for deployed Starboard Worker
103 6:26a 🔴 Starboard db/index.ts switched to @libsql/client/web for CF Workers compatibility
106 6:28a 🔵 Starboard CF Worker: static assets serve 200, only dynamic routes return 500
107 6:29a 🔵 wrangler tail connects but Worker emits zero log events on 500
108 " 🔵 Root cause found: @libsql/client not bundled in CF Workers — module resolution fails at runtime
112 " 🔵 @libsql/client package.json has workerd condition but OpenNext doesn't honor it
113 6:30a ✅ Starboard db/index.ts reverted to @libsql/client — relying on workerd export condition
115 " 🔵 OpenNext cloudflare config has useWorkerdCondition option — defaults to true
117 " 🔴 next.config.ts adds transpilePackages for @libsql/client to force Worker bundle inclusion
118 6:31a 🔵 transpilePackages had no effect — OpenNext bundles @libsql/client externally regardless of Next.js config
121 6:32a ✅ package.json CF scripts changed to force webpack build then skipNextBuild
122 " 🔵 webpack build fails — libsql pulls in native sqlite3 binaries incompatible with webpack

Access 284k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
