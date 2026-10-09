# AGENTS.md — Starboard

> Agent bootloader. Concise by design — links to [`docs/`](docs/index.md) for
> depth. Also follow the shared fleet standard at [`fleet/AGENTS.md`](https://github.com/sarthakagrawal927/fleet/blob/main/AGENTS.md):
> treat this repository as owned product code, protect production stability,
> keep changes scoped, verify work, and record durable follow-up tasks when
> something remains incomplete or blocked.

## Purpose

Project-aware GitHub repository discovery and tool intelligence. Connect public
GitHub projects, inspect explained recommendations, search the public catalog,
and organize starred repositories. Live at
[starboard.codevetter.com](https://starboard.codevetter.com). See
[docs/product/overview.md](docs/product/overview.md).

## Stack (one-liner)

Next.js 16 (App Router, React 19) + TypeScript, Cloudflare D1 (raw SQL — no
ORM) + project-owned Vectorize (768-d cosine), NextAuth v5 beta (GitHub OAuth),
nuqs + SWR, Cloudflare Workers AI `@cf/baai/bge-base-en-v1.5`, deployed to
Cloudflare Workers via `@opennextjs/cloudflare`. pnpm.

## Essential commands

```bash
pnpm install
pnpm dev               # next dev → http://localhost:3000
pnpm build             # next build --webpack
pnpm build:cf          # OpenNext Cloudflare build (production path)
pnpm deploy:cf         # build:cf + SHA-tagged wrangler deploy (manual)
pnpm typecheck         # tsc --noEmit
pnpm test              # vitest run
pnpm test:coverage     # vitest run --coverage
pnpm test:e2e          # playwright
pnpm lint              # biome check .
pnpm db:migrate        # apply migrations/* to isolated local D1
pnpm db:migrate:remote # validate config + apply migrations/* to remote D1 (approval required)
pnpm db:seed-popular   # reconcile missing popular repos (≥5k stars) — weekly GH Action
pnpm db:seed-embeddings# backfill repo_embeddings
pnpm docs:check        # validate docs/ links + structure
```

Full command map: [docs/development/commands.md](docs/development/commands.md).

## Critical constraints

- **Do not commit secrets.** `.env`, `.env.local`, `.dev.vars` are gitignored.
  Verify `.gitignore` before any push.
- **Do not deploy or run migrations without explicit user approval.**
  Commit and push safe changes.
- **Embedding dimension contract** — `EMBEDDING_DIM=768` in
  `src/lib/embeddings.ts` must match the `starboard-repos` Vectorize index.
  Model/dimension changes require a deliberate replacement index and re-embed;
  D1 stores only `repo_id` and `text_hash`. See
  [docs/architecture/decisions/0006-embedding-dimension-contract.md](docs/architecture/decisions/0006-embedding-dimension-contract.md)
  and
  [docs/operations/runbooks/embedding-dimension-drift.md](docs/operations/runbooks/embedding-dimension-drift.md).
- **Database boundaries.** Worker routes use the direct `DB` binding through
  `src/db/index.ts`; Node operator jobs use the authenticated D1 REST adapter.
  Do not add a public raw-SQL proxy. Vector writes use `REPO_VECTORS` in the
  Worker or the scoped Vectorize REST API in GitHub Actions.
- **NextAuth v5 beta** — `trustHost: true` is hardcoded in `src/lib/auth.ts`
  (env-driven `AUTH_TRUST_HOST` was unreliable). Both `AUTH_URL` and
  `NEXTAUTH_URL` must be set in `wrangler.jsonc` vars. See
  [docs/architecture/decisions/0002-nextauth-v5-beta.md](docs/architecture/decisions/0002-nextauth-v5-beta.md).
- **No ORM.** Raw SQL via the D1 adapters. Schema changes are ordered SQL files
  in `migrations/`; apply locally with `pnpm db:migrate`.
- **Generated files — do not hand-edit:** `agent-edge.mjs`, `worker.mjs`, and
  `cloudflare-env.d.ts`. See
  [docs/development/conventions.md](docs/development/conventions.md).
- **Pre-push hook** (`.husky/pre-push`) runs Biome on changed files and scans
  tracked files for common secret patterns. Re-stage modified files and retry.
- **Do not modify agent skills, plugins, or agent-profile directories**
  (`.claude/`, `.codex/`, `.symphony/`, `.clawpatch/`, any `SKILL.md`). They are
  tooling, not product code.

## Documentation navigation

- **[docs/index.md](docs/index.md)** — canonical documentation hub. Start there.
- **[PROJECT_STATUS.md](PROJECT_STATUS.md)** — current/shipped product truth
  (fleet tooling reads this filename).
- **GitHub Issues** — all open, blocked, and deferred work.
- **[README.md](README.md)** — product readme for humans landing in the repo.
- **[docs/product/](docs/product/)** — purpose, features, surfaces.
- **[docs/architecture/](docs/architecture/)** — overview, data flow, ADRs.
- **[docs/development/](docs/development/)** — setup, commands, conventions,
  testing, and the GitHub-Issue spec workflow.
- **[docs/operations/](docs/operations/)** — deploy, env, CI/CD, jobs, runbooks.
- **[docs/knowledge/](docs/knowledge/)** — current lessons, external references,
  failed approaches.
- **[docs/archive/](docs/archive/)** — historical records (pre-split ADRs,
  plans, retros, security audit, OSS evaluation).
- **[GitHub Issues](https://github.com/Codevetter/starboard/issues)** —
  proposals, design notes, requirements, and task checklists for non-trivial
  changes. See [docs/archive/openspec.md](docs/archive/openspec.md).
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
7. **Markdown is the documentation source of truth.** Keep docs links and
   structure valid with `pnpm docs:check`.

## Repo structure (high level)

```
src/
  app/                    # Next.js App Router: stars, explore, discover, projects, tools, lists, api/*
  components/             # repo-card, repo-grid (virtualized), sidebar, top-bar, tag/list pickers
  hooks/                  # SWR data hooks
  db/                     # D1 binding/REST adapters and seed-embeddings.ts
  lib/                    # github, connected projects, recommendations, auth, search, knowledgebase, ...
docs/                     # Canonical documentation (source of truth)
scripts/                  # seed-popular, enrich-repos, enrich-tools, check-docs, ...
landing-astro/            # Astro landing page (overlaid into OpenNext assets during build:cf)
public/                   # Agent-indexing surfaces (llms.txt, index.md, api-ai.json, robots.txt, sitemap.xml)
wrangler.jsonc            # Worker config: ASSETS + AI + DB + REPO_VECTORS + RAG_SERVICE
worker.mjs / agent-edge.mjs         # OpenNext-generated (do not hand-edit)
```

Detailed file map: [docs/architecture/overview.md](docs/architecture/overview.md).

## Fleet guidance

<!-- FLEET-GUIDANCE:START -->

### Adding Tasks

- Track Starboard work in this repository's GitHub Issues.
- Keep reusable cross-project automation in `saas-maker/tooling/` and private
  portfolio metadata in Site Health, not SaaS Maker.

### Using SaaS Maker

- SaaS Maker is used only for the embedded feedback widget.
- Site Health owns private portfolio metadata; `saas-maker/tooling/` owns shared
  automation. Starboard remains independently versioned and deployed.

### Free AI First

- Prefer free/local AI paths for routine development and analysis: the
  `free-ai` gateway, local models, provider free tiers, and cached context.
- Escalate to paid models only when complexity, correctness risk, or missing
  capability justifies the cost.
- Note any paid-AI use in the task or handoff when it materially affects cost,
  reproducibility, or future maintenance.

<!-- FLEET-GUIDANCE:END -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
