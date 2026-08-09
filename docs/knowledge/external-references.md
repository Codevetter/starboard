# External References

Authoritative sources for the novel technologies in Starboard. Each entry: what it is, why it matters here, link.

---

## Cloudflare D1 and Vectorize

**D1 query JSON** — `json_each(?)` keeps variable-length candidate/filter sets
within D1's bound-parameter limit.
→ https://developers.cloudflare.com/d1/sql-api/query-json/

**D1 import/export** — supported SQLite dump transfer and Wrangler import path.
→ https://developers.cloudflare.com/d1/best-practices/import-export-data/

**Vectorize client API** — project-owned 768-d cosine query/upsert contract.
→ https://developers.cloudflare.com/vectorize/reference/client-api/

---

## libSQL / Turso vector storage

Historical source-migration reference; superseded at runtime by ADR-0009.

**libSQL vector extensions** — `F32_BLOB` column type, `libsql_vector_idx`, `vector_top_k`, `vector_distance_cos`, `vector_extract`. The core primitives Starboard uses for ANN search in Turso.  
→ https://docs.turso.tech/features/ai-and-embeddings

**libSQL vector index internals** — explains why the index is dimension-pinned at creation and what `metric=cosine` means for the index structure. Directly explains the self-heal pattern in `migrate.ts`.  
→ https://github.com/tursodatabase/libsql/blob/main/docs/VECTOR_SEARCH.md

---

## BGE embedding model

**BAAI BGE-base-en-v1.5 model card** — canonical model used in Starboard (`@cf/baai/bge-base-en-v1.5`). Documents the 768-dimension output, the training approach (contrastive), and recommended use (asymmetric retrieval — queries and passages treated differently). The 768d output is the source of `EMBEDDING_DIM=768`.  
→ https://huggingface.co/BAAI/bge-base-en-v1.5

---

## Cloudflare Workers AI

**Workers AI REST API and bindings** — documents the `AI` binding interface (`ai.run(model, input)`), model catalog, per-model limits, and how the binding differs from the HTTP REST API. The binding path in `embeddings.ts` is `ai.run(EMBEDDING_MODEL, { text: texts })`.  
→ https://developers.cloudflare.com/workers-ai/

**Workers AI — text embeddings** — specific docs for the embedding task type, input format, and model list. Explains the `{ data: number[][] }` response shape used in `embedViaBinding()`.  
→ https://developers.cloudflare.com/workers-ai/models/#text-embeddings

---

## OpenNext / Cloudflare

**@opennextjs/cloudflare** — the adapter that wraps a Next.js `standalone` build into a Cloudflare Worker. Documents `defineCloudflareConfig`, the `incrementalCache` override pattern, and the `--skipNextBuild` flag used in Starboard's `build:cf` script.  
→ https://opennext.js.org/cloudflare

**OpenNext caching** — documents that SSR routes need no incremental-cache
override and that `staticAssetsIncrementalCache` is for fully static sites.
→ https://opennext.js.org/cloudflare/caching

**Cloudflare cache configuration** — documents response directives including
`private` and `no-store`, used to keep authenticated HTML out of shared cache.
→ https://developers.cloudflare.com/workers/cache/configuration/

---

## NextAuth on edge / CF Workers

**NextAuth v5 (Auth.js) — Edge runtime guide** — documents what Node APIs are unavailable on edge runtimes and how `trustHost` works. Directly relevant to the `trustHost: true` hardcoding fix in `src/lib/auth.ts`.  
→ https://authjs.dev/guides/edge-compatibility

---

## Reciprocal Rank Fusion

**Cormack & Clarke 2009 — RRF paper** — the original RRF paper defining `score = sum 1/(k + rank_i)` and the `k=60` default used in Starboard's `rrfFuse()`.  
→ https://dl.acm.org/doi/10.1145/1571941.1572114

**LanceDB hybrid search guide** — practical walkthrough of combining BM25 and vector ANN with RRF, including implementation patterns close to what Starboard uses. Used as design reference (not a dependency) per `docs/oss-integration-evaluation.md`.  
→ https://lancedb.github.io/lancedb/hybrid_search/hybrid_search/
