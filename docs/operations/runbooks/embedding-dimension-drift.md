# Runbook: Embedding dimension drift

The most common operational issue for Starboard. The migrate path is the only
safe remediation — do not hand-edit the Turso `repo_embeddings` table.

## Symptom

- `seed-popular` or `embed-pending` workflow fails with
  `vector dimensions different: N != M` at insert time.
- `generateEmbeddings()` throws naming the model and both dimensions.

## Root cause

`libsql_vector_idx` is dimension-pinned at `CREATE INDEX` time. The index and
the `F32_BLOB(N)` column type embed the dimension in their metadata. Inserting a
vector whose length ≠ `N` fails at insert, not query time. This happens when:

- The embedding model changed but the schema/migrate files were not updated
  together.
- The HTTP AI Gateway returned a doubled-dimension vector (historical window
  2026-04-11 → 2026-05-23). `normalizeEmbeddingDimensions()` in
  `src/lib/embeddings.ts` averages adjacent pairs to reduce back to 768d, but
  only when the length is a clean multiple of `EMBEDDING_DIM`.

## Self-heal (automated)

The `seed-popular` workflow runs `pnpm db:migrate` before
`pnpm db:seed-popular`. `ensureEmbeddingDimension()` in `src/db/migrate.ts`:

1. Reads `PRAGMA table_info(repo_embeddings)`.
2. Parses the `F32_BLOB(<n>)` column type.
3. If `<n> ≠ EMBEDDING_DIM` (768), drops the table and the vector index.
4. The subsequent `CREATE TABLE IF NOT EXISTS` in `schema.sql` recreates them at
   the correct dimension.

So **dimension drift heals on the next manually dispatched `seed-popular` run**
without direct DB surgery. Automatic scheduling is paused while the workflow
has no provider-side row-read budget circuit breaker. Re-embedding proceeds at
up to `SEED_DAILY_LIMIT` per dispatch until the pool is refilled.

## Manual remediation (only if self-heal is not running)

```bash
pnpm db:migrate          # ensureEmbeddingDimension() drops + recreates
pnpm db:seed-embeddings  # backfill embeddings for existing repos
```

Do not run `DROP TABLE` against Turso directly — the migrate runner is the only
path that also recreates the vector index correctly.

## Changing the embedding model

Three files pin `EMBEDDING_DIM=768` and must change together — see
[../../architecture/decisions/0006-embedding-dimension-contract.md](../../architecture/decisions/0006-embedding-dimension-contract.md):

1. `src/lib/embeddings.ts` — `EMBEDDING_MODEL` and `EMBEDDING_DIM`.
2. `src/db/schema.sql` — `F32_BLOB(<dim>)` + index DDL.
3. `src/db/migrate.ts` — `ensureEmbeddingDimension()` reads the new
   `EMBEDDING_DIM`.

Land the change on `main`; the next scheduled `seed-popular` run drops the old
table, recreates it, and re-embeds from scratch.
