# Testing

## Unit tests (Vitest)

- **Runner:** Vitest 4 with v8 coverage. Config in `vitest.config.ts`.
- **Location:** `src/__tests__/` (one file per module under test).
- **Coverage thresholds:** 80% lines/functions/statements, 70% branches on core
  logic modules (`github-projects`, `project-recommendations`, `search`, and
  `starboard-rag-documents`).

```bash
pnpm test              # vitest run
pnpm test:watch        # vitest (watch)
pnpm test:coverage     # vitest run --coverage
```

## Integration tests

- `src/__tests__/search-integration.test.ts` — static integration guard proving
  FTS remains in D1 and ANN routes use the project-owned Vectorize adapter.
- D1 adapters, Vectorize binding/REST writer, migration converters, and
  write-freeze behavior have focused unit tests.
- `src/__tests__/knowledgebase-rag.test.ts` — README-only recall terms, bounded
  ingest batching, and lexical-only fallback when the shared RAG Worker is
  unavailable or unconfigured.

## Project recommendation tests

- `src/__tests__/github-projects.test.ts` validates public GitHub input.
- `src/__tests__/project-recommendations.test.ts` covers evidence ranking,
  sparse-context fallback labeling, and exclusions.
- Ranking weight changes must keep explanations tied to observable evidence.

## End-to-end (Playwright)

- **Runner:** Playwright. Config in `playwright.config.ts`. Tests in `e2e/`.
- `pnpm test:e2e` — runs `build:e2e` locally to produce a credential-free
  OpenNext artifact, overlays the real Astro landing, then exercises landing
  and mocked public-product journeys at desktop and mobile widths. CI builds
  that artifact once before starting Playwright.
- Cloudflare and E2E builds remove only the generated `.next` and `.open-next`
  directories first. E2E also uses and clears its isolated
  `.wrangler/e2e-state`, preventing stale HTML and client chunk hashes from
  being combined across consecutive local builds.
- Playwright starts the artifact with `wrangler.e2e.jsonc`, a local-only
  binding set and applies migrations to its disposable local D1 before the
  preview starts. The config omits Cloudflare AI, Vectorize, and service
  bindings, and the runner loads `/dev/null` instead of `.dev.vars`, so the
  suite needs no operator credentials and cannot call production resources.
- Covered journeys: public project CTA, Discover search stability, bounded Tool
  Intelligence pagination, the shared repository-intelligence shell, and the
  uncataloged-preview sign-in boundary.
- `pnpm test:e2e:mobile` — the mobile Next.js application journeys only.

## Smoke checks

- `pnpm smoke:knowledgebase` — `node scripts/smoke-knowledgebase.mjs` smokes the
  shared RAG Worker.
- `pnpm build` and `pnpm build:cf` — for search/DB changes also run
  `pnpm db:migrate` and `pnpm build:cf` to catch Worker bundling regressions.

## CI

- `.github/workflows/ci.yml` — push/PR: `pnpm install --frozen-lockfile` →
  `lint` → `test:coverage` → `build:e2e` → Chromium install → `test:e2e`.
- `.github/workflows/weekly.yml` — Mondays 09:00 UTC: lint, typecheck, test,
  build (catches drift that doesn't surface on push CI).
- `.github/workflows/docs.yml` — push/PR on docs-touching paths: runs
  `pnpm docs:check`. See [../operations/ci-cd.md](../operations/ci-cd.md).
