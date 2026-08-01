# ADR-0006 — Embedding dimension contract: 768d BGE, enforced at migrate time

**Date:** 2026-04-11 (initial); 2026-05-16 (self-heal added)
**Status:** Superseded by [ADR-0009](0009-cloudflare-d1-vectorize.md)

## Context

`libsql_vector_idx` is dimension-pinned. Inserting a vector of the wrong length
fails silently or throws "vector dimensions different: N != M". Early deploys
hit this after the embedding gateway occasionally returned doubled-dimension
responses.

## Decision

Three files pin `EMBEDDING_DIM=768` together:

1. `src/lib/embeddings.ts` — `EMBEDDING_MODEL` and `EMBEDDING_DIM` constants
   plus a runtime assertion in `generateEmbeddings()` that throws on mismatch.
2. `src/db/schema.sql` — `repo_embeddings.embedding F32_BLOB(768)` column and
   the `libsql_vector_idx` cosine index DDL.
3. `src/db/migrate.ts` — `ensureEmbeddingDimension()` parses
   `PRAGMA table_info(repo_embeddings)`, detects drift, and drops + recreates
   the table before running schema.

The seed workflow runs `db:migrate` first, so dimension self-heal fires on every
CI run.

## Rationale

The migration-time check means no manual DB surgery is needed if the model
changes. The assert in `generateEmbeddings()` surfaces a clear error message
instead of silent vector truncation.

## Alternatives considered

- Migration guard only (no runtime assert) — silently inserts wrong vectors.
- Runtime assert only (no schema drop) — migration succeeds but inserts fail.

## Tradeoffs

A model change triggers a full table drop + re-embed (up to `SEED_DAILY_LIMIT`
per day until the pool fills). The `normalizeEmbeddingDimensions()` helper in
`embeddings.ts` handles the edge case where an API gateway doubles the dimension
by averaging pairs, but that is a last resort, not the normal path.

## See also

- [../../operations/runbooks/embedding-dimension-drift.md](../../operations/runbooks/embedding-dimension-drift.md)
- [../../knowledge/learnings.md](../../knowledge/learnings.md) — embedding
  pipeline lessons.
