# Failed Approaches

Approaches tried and abandoned, with reasons. Preserved so the same path is not
retried without a new reason. Each entry links to the relevant decision record
and archived material.

## Cloudflare Pages deploy (same-day revert, 2026-04-25)

**What:** Migrated the deploy from Cloudflare Workers to Cloudflare Pages for a
clean `*.pages.dev` URL.

**Why abandoned:** The OpenNext Pages pattern was broken for this app — the
deploy workflow did not produce a working bundle. Reverted the same day
(commit `77951f5` → `0170b8b`, three days later). The
`staticAssetsIncrementalCache` override in `open-next.config.ts` targets the
Workers binding API and does not translate cleanly to the Pages build pipeline.

**What replaced it:** Stayed on Workers. See
[../architecture/decisions/0001-deploy-vercel-to-cloudflare-workers.md](../architecture/decisions/0001-deploy-vercel-to-cloudflare-workers.md)
and
[../archive/retro-2026-04-25-vercel-to-cloudflare.md](../archive/retro-2026-04-25-vercel-to-cloudflare.md).

**Do not retry unless:** OpenNext publishes a first-class, tested Pages adapter
and a trivial sample app verifies it before adopting for production.

## OpenNext `useWorkerdCondition` / webpack externals for @libsql

**What:** Tried `useWorkerdCondition: true` in OpenNext config and a webpack
externals override to get `@libsql/client` bundled into the Worker.

**Why abandoned:** `useWorkerdCondition` had no effect; the webpack externals
override caused native sqlite3 import failures (libsql pulls in native binaries
incompatible with webpack).

**What replaced it:** The four-part workaround in
[../architecture/decisions/0003-opennext-libsql-bundling.md](../architecture/decisions/0003-opennext-libsql-bundling.md)
(`/web` subpath import + `transpilePackages` + `--webpack` build + lazy-init
proxy).

**Do not retry unless:** OpenNext honors the `workerd` export condition for
externalized packages without manual intervention.

## Cloudflare D1 migration (evaluated, rejected)

**Status update (2026-08-01):** superseded by
[ADR-0009](../architecture/decisions/0009-cloudflare-d1-vectorize.md). D1 gained
the required capacity/import path and Starboard now pairs it with project-owned
Vectorize rather than waiting for libSQL-compatible vectors inside D1.

**What:** Evaluated migrating the database from Turso (libSQL) to Cloudflare D1
to consolidate on a single provider.

**Why abandoned:** Turso was already provisioned with the full schema, vector
index, and seeded data; D1 has different limits and a different vector story;
and the migration blast radius was large for no clear win. See
[../architecture/decisions/0004-turso-f32-blob-vectors.md](../architecture/decisions/0004-turso-f32-blob-vectors.md)
and the memory-context decision `Starboard database migration decision — Turso
→ Cloudflare D1` (Apr 25 2026).

**What replaced it:** Stayed on Turso. The `@libsql/client/web` import path
works on Workers.

**Original retry condition:** a compatible vector and deterministic transfer
path. Vectorize plus the migration tooling now satisfies that condition.

## Cross-encoder reranking (ort / ONNX)

**What:** Considered a Rust ONNX runtime (`ort`) for local cross-encoder
re-ranking of search results.

**Why abandoned:** Workers-incompatible ONNX runtime; model packaging and
cold-start unclear. Parked per
[../archive/oss-integration-evaluation.md](../archive/oss-integration-evaluation.md).

**What replaced it:** Light heuristic rerank (cosine + topic/language/word
boosts) — see
[../architecture/decisions/0007-similar-repos-reranking.md](../architecture/decisions/0007-similar-repos-reranking.md).

**Do not retry unless:** A local/offline Starboard worker exists with a
runtime that supports ONNX.

## Adding a separate vector DB (Pinecone / Qdrant / LanceDB)

**What:** Considered adding a dedicated vector store alongside Turso.

**Why abandoned:** Breaks the single-DB model, adds a second paid service, and
adds a round-trip join between relational and vector results. LanceDB kept as a
*design reference* only — see
[../archive/oss-integration-evaluation.md](../archive/oss-integration-evaluation.md).

**What replaced it:** Turso `F32_BLOB` + `libsql_vector_idx` for non-RAG
features; shared `knowledgebase` Worker for relevance RAG. See
[../architecture/decisions/0004-turso-f32-blob-vectors.md](../architecture/decisions/0004-turso-f32-blob-vectors.md).

**Do not retry unless:** The seeded pool exceeds ~100k repos and
`vector_top_k` global-scope filtering becomes a latency problem.
