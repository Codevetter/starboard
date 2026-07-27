# Data Flow

Request lifecycles for the three core Starboard paths: star sync, search, and
fleet recommendations. Schema is in `src/db/schema.sql`; see
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
        │     (bounded batches; README text when available, metadata fallback)
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
shared RAG Worker. The Turso vector index (`repo_embeddings`,
`libsql_vector_idx`) remains for similar-repos, discover, and recommendations —
see [decisions/0008-hybrid-rrf-search.md](decisions/0008-hybrid-rrf-search.md)
and [decisions/0007-similar-repos-reranking.md](decisions/0007-similar-repos-reranking.md).

`vector_top_k` is global (no predicate pushdown): `VEC_TOP_K=500` candidates are
fetched, then user-scope filtering happens in the outer `WHERE`. Acceptable at
current corpus size; revisit if the seeded pool exceeds ~100k repos.

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
  ├── pnpm db:migrate            (dimension self-heal fires here)
  ├── pnpm db:seed-popular       (scripts/seed-popular.ts)
  │     GitHub Search (≥5k stars) → repos + repo_star_snapshots
  │     resumable cursor in seed_cursor table
  │     embeddings via HTTP gateway (Node env)
  └── pnpm db:enrich-tools       (scripts/enrich-tools.ts)
        SBOM / tree / manifest tool detection → repo_tools

enrich-repos.yml (workflow_dispatch)   — AI metadata enrichment
embed-pending.yml (workflow_dispatch)  — backfill repo_embeddings
weekly-threshold-digest.yml (workflow_dispatch) — digest → GitHub issue + email
weekly.yml (Mon 09:00 UTC)             — lint/typecheck/test/build quality
```

See [operations/jobs.md](../operations/jobs.md) for the full schedule and
[operations/runbooks/embedding-dimension-drift.md](../operations/runbooks/embedding-dimension-drift.md)
for the self-heal procedure.
