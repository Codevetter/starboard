# ADR-0004 — Turso (libSQL) with F32_BLOB vectors vs pgvector / Pinecone / Qdrant

**Date:** 2026-04-11
**Status:** Superseded by [ADR-0009](0009-cloudflare-d1-vectorize.md)

## Context

Starboard needed both relational data (users, repos, lists, tags) and vector
similarity search. Three options: add a separate vector DB alongside a
relational store; migrate to Postgres + pgvector; use Turso's native
`F32_BLOB` / `libsql_vector_idx` that landed in libSQL 0.4.

## Decision

Turso with `F32_BLOB(768)` column and
`libsql_vector_idx(embedding, 'metric=cosine')` index. No separate vector store.

## Rationale

Single database for all data eliminates a round-trip join between relational and
vector results. Turso is already the persistence layer (no new ops surface).
`libsql_vector_idx` exposes ANN search through the same SQL interface as the
rest of the schema. Free tier covers the current corpus size.

## Alternatives considered

- pgvector (Neon/Supabase): strong ecosystem, but requires migrating off Turso
  entirely and adds a Postgres operational surface.
- Pinecone / Qdrant: strong managed ANN at scale, but breaks the single-DB model
  and adds a second paid service.

## Tradeoffs

`libsql_vector_idx` is relatively new and has rough edges (dimension-pinned,
`vector_top_k` is global not filtered). The user-scope filter in semantic search
is applied in the `WHERE` clause after ANN, not inside the index, so
`VEC_TOP_K=500` candidate rows are fetched before user-filtering. This is
acceptable at current corpus size but will need revisiting if the seeded pool
exceeds ~100k repos.

## See also

- [0006-embedding-dimension-contract.md](0006-embedding-dimension-contract.md)
- [../../knowledge/learnings.md](../../knowledge/learnings.md) — `vector_top_k`
  global-scope and `vector_extract()` lessons.
- [../../archive/oss-integration-evaluation.md](../../archive/oss-integration-evaluation.md)
