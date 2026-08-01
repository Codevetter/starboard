# Data Flow

Request lifecycles for the three core Starboard paths: star sync, search, and
fleet recommendations. Schema is in `migrations/`; see
[architecture/overview.md](overview.md) for the component map.

## Star sync (`POST /api/stars/sync`)

```
browser (signed-in)
  │  session: GitHub user id + access token (NextAuth JWT/session callbacks)
  ▼
src/lib/github.ts
  ├── GET /user/starred (per page, 100/page)
  │     ETag cached — 304 responses skip re-processing
  ├── diff against user_repos (added / removed)
  └── batch upsert into repos + user_repos (tags JSON array preserved)
        │
        ├── if RAG configured: src/lib/starboard-rag-documents.ts
        │     builds README/metadata doc → knowledgebase Worker ingest
        │     (bounded batches; at most 25 README fetches per sync,
        │      metadata fallback for every other added repo)
        └── repo_embeddings row written by seed-embeddings path (not sync)
```

GitHub star *lists* (named groupings inside GitHub) have no official API;
`src/lib/github-lists.ts` scrapes GitHub HTML. This is brittle to markup
changes — monitor sync error rates.

## Search (`GET /api/stars`)

```
browser → /api/stars?sort=relevance&q=...
  │
  ├── facets: language/list/tag counts (server-side, always)
  │
  ├── if sort=relevance AND RAG configured:
  │     src/lib/knowledgebase.ts → RAG_SERVICE binding
  │       relevance search over ingested README/metadata docs
  │       → ranked repo ids
  │
  ├── else if sort=relevance (no RAG):
  │     lexical-only fallback (FTS5 BM25 over repos_fts / repo_ai_metadata_fts)
  │
  └── else (sort ≠ relevance):
        simple SQL order (stars, updated, name) — vector path skipped
```

Hybrid RRF fusion (FTS5 BM25 + vector ANN) is implemented in
`src/lib/search.ts:rrfFuse()` but the production relevance path now prefers the
shared RAG Worker. The project-owned Vectorize index serves similar-repos and
recommendations; D1 `repo_embeddings` stores drift hashes and ownership —
see [decisions/0008-hybrid-rrf-search.md](decisions/0008-hybrid-rrf-search.md)
and [decisions/0007-similar-repos-reranking.md](decisions/0007-similar-repos-reranking.md).

Vectorize returns a bounded global candidate set; D1 ownership filters and
hydrates those IDs before the existing reranking logic runs.

## Fleet recommendations (`/projects`, `/projects/[slug]`)

```
data/fleet-projects.generated.json   ← pnpm fleet:extract-projects (fleet repos)
  │
  ▼
src/lib/fleet-projects.ts scorer
  ├── lexical + metadata overlap
  ├── repo category / AI metadata overlap
  ├── embedding-distance boost (when available)
  ├── suppression of packages already used by the target fleet project
  └── deterministic ranking → /projects/[slug]
        │
        └── src/lib/recommendation-eval.ts (fixture-backed eval harness)
              src/__tests__/fixtures/recommendation-eval-fixture.ts
              Run before tuning production weights.
```

Regenerate the fleet snapshot after fleet `PROJECT_STATUS.md` or dependency
changes: `pnpm fleet:extract-projects`.

## Scheduled enrichment (GitHub Actions)

```
seed-popular.yml (workflow_dispatch only; automatic schedule paused)
  ├── pnpm db:migrate:remote     (approval-gated D1 migrations)
  ├── pnpm db:seed-popular       (scripts/seed-popular.ts)
  │     GitHub Search (≥5k stars) → repos + repo_star_snapshots
  │     resumable cursor in seed_cursor table
  │     metadata refresh → D1; authenticated Worker step performs embeddings
  │     through Workers AI → Vectorize binding; hashes → D1 binding
  └── pnpm db:enrich-tools       (scripts/enrich-tools.ts)
        SBOM / tree / manifest tool detection → repo_tools

enrich-repos.yml (workflow_dispatch)   — D1 AI metadata enrichment
embed-pending.yml (workflow_dispatch)  — authenticated Worker binding backfill
weekly-threshold-digest.yml (workflow_dispatch) — digest → GitHub issue + email
weekly.yml (Mon 09:00 UTC)             — lint/typecheck/test/build quality
```

See [operations/jobs.md](../operations/jobs.md) for the full schedule and
[operations/runbooks/embedding-dimension-drift.md](../operations/runbooks/embedding-dimension-drift.md)
for the replacement-index procedure.
