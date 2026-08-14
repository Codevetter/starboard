# Commands

Source of truth: `scripts` in `package.json`. This page annotates intent; run
`pnpm run` to see the live list.

## App

| Command | Purpose |
| --- | --- |
| `pnpm dev` | `next dev` → http://localhost:3000 |
| `pnpm build` | `next build --webpack` |
| `pnpm start` | `next start` |
| `pnpm lint` | `biome check .` |
| `pnpm biome:lint` | `biome lint .` |
| `pnpm format` | `biome format --write .` |
| `pnpm format:check` | `biome format .` |
| `pnpm check` | `biome check .` |
| `pnpm typecheck` | `tsc --noEmit` |

## Cloudflare / OpenNext

| Command | Purpose |
| --- | --- |
| `pnpm cf:build` | clean generated build output + `next build --webpack` + inline critical CSS + `opennextjs-cloudflare build --skipNextBuild` + `populateCache local` + landing-astro build + overlay |
| `pnpm build:cf` | Alias for `cf:build` |
| `pnpm build:e2e` | Credential-free OpenNext build plus Astro landing overlay for browser tests |
| `pnpm preview:cf` | `build:cf` + `opennextjs-cloudflare preview` |
| `pnpm deploy:cf` | `build:cf` + SHA-tagged `opennextjs-cloudflare deploy` (manual) |
| `pnpm cf:typegen` | `wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts` |

The `--webpack` flag remains the verified OpenNext production build path.

## Database

| Command | Purpose |
| --- | --- |
| `pnpm db:migrate` | Apply ordered migrations to isolated local D1 |
| `pnpm db:migrate:remote` | Validate non-placeholder D1 config and apply remote migrations (approval required) |
| `pnpm db:seed-embeddings` | Backfill Vectorize and D1 embedding hashes through scoped Cloudflare APIs |
| `pnpm db:convert-turso-dump` | Convert a Turso SQL dump to D1 relational import SQL |
| `pnpm db:convert-turso-vectors` | Validate/convert extracted 768-d vectors to Vectorize NDJSON |
| `pnpm db:snapshot-turso-logical starboard` | Produce a row-free deterministic Turso digest for final cutover reconciliation |
| `pnpm db:enrich-repos` | `tsx scripts/enrich-repos.ts` — AI metadata enrichment |
| `pnpm db:seed-popular` | `tsx scripts/seed-popular.ts` — fully reconcile and add missing popular repos (≥5k stars) |
| `pnpm db:enrich-tools` | `tsx scripts/enrich-tools.ts` — SBOM/tree/manifest tool detection |

## Testing

| Command | Purpose |
| --- | --- |
| `pnpm test` | `vitest run` |
| `pnpm test:watch` | `vitest` |
| `pnpm test:coverage` | `vitest run --coverage` (v8; thresholds 80/80/80/70 on core modules) |
| `pnpm test:e2e` | `playwright test` |
| `pnpm test:e2e:mobile` | `playwright test --project=mobile` |
| `pnpm smoke:knowledgebase` | `node scripts/smoke-knowledgebase.mjs` — smoke the shared RAG Worker |

## Docs

| Command | Purpose |
| --- | --- |
| `pnpm docs:check` | `node scripts/check-docs.mjs` — validate docs/ links + structure |
| `pnpm docs:dev` | `blume dev` — local docs site (requires `pnpm add -D blume`) |
| `pnpm docs:build` | `blume build` — static site → `.blume/dist` (presentation only; not part of production build) |

## Misc

| Command | Purpose |
| --- | --- |
| `pnpm prepare` | `husky` (installs pre-push hook) |
