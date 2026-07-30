# Testing

## Unit tests (Vitest)

- **Runner:** Vitest 4 with v8 coverage. Config in `vitest.config.ts`.
- **Location:** `src/__tests__/` (one file per module under test).
- **Fixtures:** `src/__tests__/fixtures/` (e.g.
  `recommendation-eval-fixture.ts`).
- **Coverage thresholds:** 80% lines/functions/statements, 70% branches on core
  logic modules (`src/lib/fleet-projects`, `recommendation-eval`, `search`,
  `stack-builder`, `starboard-rag-documents`, `release-radar`).

```bash
pnpm test              # vitest run
pnpm test:watch        # vitest (watch)
pnpm test:coverage     # vitest run --coverage
```

## Integration tests

- `src/__tests__/search-integration.test.ts` — semantic relevance + similar-repos
  + lexical NOCASE integration tests. These hit a live Turso vector search, so
  they require `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` and are skipped when
  unavailable.
- `src/__tests__/knowledgebase-rag.test.ts` — README-only recall terms, bounded
  ingest batching, and lexical-only fallback when the shared RAG Worker is
  unavailable or unconfigured.

## Recommendation eval harness

- `src/lib/recommendation-eval.ts` + `src/__tests__/recommendation-eval.test.ts`
  + `src/__tests__/fixtures/recommendation-eval-fixture.ts`.
- Tune production ranking weights **only** when the fixture benchmark stays
  green across scorer changes. See
  [../archive/plans-2026-06-12-hybrid-ranking-eval-harness.md](../archive/plans-2026-06-12-hybrid-ranking-eval-harness.md).

## End-to-end (Playwright)

- **Runner:** Playwright. Config in `playwright.config.ts`. Tests in `e2e/`.
- `pnpm test:e2e` — desktop project.
- `pnpm test:e2e:mobile` — mobile project.

## Smoke checks

- `pnpm smoke:knowledgebase` — `node scripts/smoke-knowledgebase.mjs` smokes the
  shared RAG Worker.
- `pnpm build` and `pnpm build:cf` — for search/DB changes also run
  `pnpm db:migrate` and `pnpm build:cf` to catch Worker bundling regressions.

## CI

- `.github/workflows/ci.yml` — push/PR: `pnpm install --frozen-lockfile` →
  `lint` → `test:coverage` → `build`.
- `.github/workflows/weekly.yml` — Mondays 09:00 UTC: lint, typecheck, test,
  build (catches drift that doesn't surface on push CI).
- `.github/workflows/docs.yml` — push/PR on docs-touching paths: runs
  `pnpm docs:check`. See [../operations/ci-cd.md](../operations/ci-cd.md).
