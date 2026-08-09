# Engineering Lessons

Concrete gotchas encountered building Starboard. Each lesson is evidenced by
code or a git commit and links to the relevant decision record where applicable.

See also: [external-references.md](external-references.md) for authoritative
sources, [failed-approaches.md](failed-approaches.md) for abandoned paths, and
[../architecture/decisions/](../architecture/decisions/) for the *why*.

The Turso/libSQL sections below are retained as historical evidence. Current
persistence guidance is [ADR-0009](../architecture/decisions/0009-cloudflare-d1-vectorize.md).

---

## Embedding pipeline

### F32_BLOB is dimension-pinned at index creation — mismatches throw, not silently truncate

`libsql_vector_idx` embeds the dimension in the index metadata at `CREATE INDEX` time. Inserting a vector of a different length fails with "vector dimensions different: N != M". The error is raised at insert, not at query time, so a dimension change that passes all unit tests will still break production inserts until the index is dropped and recreated.

**Fix:** `migrate.ts` → `ensureEmbeddingDimension()` reads `PRAGMA table_info(repo_embeddings)`, parses the `F32_BLOB(N)` column type, and drops both the table and index if `N ≠ EMBEDDING_DIM`. The subsequent `CREATE TABLE IF NOT EXISTS` in `schema.sql` recreates them at the correct dimension.

**Commits:** `Fix seed workflow auth and embedding dimensions` (2026-05-23), `Fix runtime shim and embedding dimensions` (2026-05-16)

---

### The AI Gateway HTTP path can return doubled-dimension vectors

When `embedViaHttp()` is used (Node CLI / GH Actions path), the gateway can return vectors of length `EMBEDDING_DIM * 2` for some model/request combinations. The `normalizeEmbeddingDimensions()` function in `embeddings.ts` detects this (length is a clean multiple of `EMBEDDING_DIM`) and averages adjacent pairs to reduce back to `EMBEDDING_DIM`. This is a workaround, not the normal path — the binding path does not exhibit this behavior.

**Evidence:** `Normalize gateway embedding dimensions` commit (2026-05-23); `normalizeEmbeddingDimensions()` in `src/lib/embeddings.ts` lines 166–179.

---

### `generateEmbeddings()` throws on dimension mismatch — this is intentional

After normalization, if the vector length still does not equal `EMBEDDING_DIM`, the function throws with a message naming the model and both dimensions. This is by design: silent wrong-dimension inserts corrupt the index, so a loud failure is better. If you see this error, update all three pinned files together (`embeddings.ts`, `schema.sql`, `migrate.ts`).

---

### Batch size matters: BATCH_SIZE=50 for Workers AI

Workers AI has per-request limits. The embedding pipeline sends texts in batches of 50 (`BATCH_SIZE` in `embeddings.ts`). Larger batches fail silently or hit rate limits. The HTTP path adds exponential backoff (base 400 ms, 3 attempts) for 429 and 5xx responses.

---

## @libsql/client in Cloudflare Workers

### Must import `@libsql/client/web`, not `@libsql/client`

The default `@libsql/client` entry pulls in `better-sqlite3` native bindings for the Node sync path. In workerd, this fails at module resolution. The `/web` subpath (`src/db/index.ts`) exports only the HTTP/WebSocket client that workerd can run.

**Evidence:** `src/db/index.ts` line 1; commit message for `chore(cf): migrate from Vercel to Cloudflare Workers via opennext` documents the failed attempts before this fix.

---

### opennext-cloudflare 1.19 externalizes @libsql/client regardless of transpilePackages

Even with `transpilePackages: ["@libsql/client"]` in `next.config.ts`, OpenNext 1.19 was externalizing the package, causing a runtime module-not-found. The working combination is: `/web` subpath import + `transpilePackages` entry + webpack build path (`--webpack`, not Turbopack). All three are required.

**Evidence:** Commit message for `178a2be`; lines 24–26 of `next.config.ts` comment.

---

### Lazy-init the libsql client via a Proxy — do not construct at module load

Constructing `createClient()` at module top-level caused CI build failures because `TURSO_DATABASE_URL` is not set at build time. The Proxy pattern in `src/db/index.ts` defers client creation to the first method call, where env vars are always available.

**Evidence:** `fix(db): lazy-init libsql client to fix CI build` commit (2026-04-28); `src/db/index.ts`.

---

## NextAuth on Cloudflare Workers

### `trustHost: true` must be hardcoded — env-driven flag was unreliable

`AUTH_TRUST_HOST=true` set via `wrangler.jsonc` vars was not reliably read by NextAuth v5 in the Worker, causing cookie rejection on OAuth callbacks. Setting `trustHost: true` directly in the `NextAuth({...})` call in `src/lib/auth.ts` is the stable fix.

**Evidence:** `fix(auth): set AUTH_URL/NEXTAUTH_URL vars for prod cookie/redirect resolution` commit (2026-04-28); `src/lib/auth.ts` line 6.

---

### Both `AUTH_URL` and `NEXTAUTH_URL` must be set in wrangler.jsonc vars

NextAuth v5 reads `AUTH_URL` for the callback base URL; the legacy `NEXTAUTH_URL` is also read by some internal paths. Setting only one causes redirect or cookie domain mismatches in the deployed Worker.

**Evidence:** `wrangler.jsonc` `vars` block; commit `fix(auth): set AUTH_URL/NEXTAUTH_URL vars`.

---

## OpenNext / Cloudflare build

### CF Pages deploy pattern was broken for this app — required reverting to Workers

The project briefly tried deploying via CF Pages (`ci: migrate deploy from CF Workers to CF Pages`, 2026-04-25). The deploy workflow was broken for the opennext pattern and reverted one business day later (`ci: rewrite workflow for Workers deploy`, 2026-04-28). The Workers deploy pattern (`wrangler deploy`, `worker.mjs` entrypoint) is stable.

---

### Static-assets incremental caching is unsafe for this mixed authenticated app

OpenNext's `staticAssetsIncrementalCache` is for fully static sites. Starboard
also has authenticated SSR routes, so using that adapter allowed personalized
HTML to be stored in the public asset cache. Keep OpenNext's default behavior
for dynamic routes, cache only the Astro landing and immutable assets through
their explicit asset policy, and mark protected HTML `private, no-store`.

**Operational consequence:** after correcting this boundary in production,
purge the affected edge cache and revoke any GitHub OAuth token that may have
been serialized into a cached response. Rotating `AUTH_SECRET` invalidates the
Starboard session but does not revoke the upstream GitHub token.

---

### OG image route cannot use edge runtime on OpenNext Cloudflare

`next/og` uses the `ImageResponse` API. On OpenNext Cloudflare, marking the OG image route as `export const runtime = 'edge'` fails. Remove the `runtime` export and let OpenNext handle the route as a standard serverless function.

**Evidence:** `fix: opengraph-image cannot use edge runtime on OpenNext Cloudflare` commit (2026-05-xx); `wrangler.jsonc` `nodejs_compat` flag ensures the Node APIs needed by the default runtime are available.

---

## Vector search queries

### `vector_top_k` is global — user filtering happens after the ANN, not inside it

`vector_top_k('idx_repo_embeddings_vec', vector(?), K)` returns the K nearest rows globally across all users. To filter to a user's repos, a `JOIN user_repos ur ON ur.repo_id = re.repo_id WHERE ur.user_id = ?` is applied after the ANN call. This means `VEC_TOP_K=500` candidates are fetched even when a user has 100 starred repos. At current corpus size this is fine; if the seeded pool grows to 100k+ rows, a pre-filter or partitioned index will be needed.

**Evidence:** `src/app/api/stars/route.ts` lines 86–101.

---

### F32_BLOB is returned as a Buffer/Uint8Array from libsql — must use `vector_extract()` to get JSON

When reading an embedding back from Turso to use as a query vector, the raw `SELECT embedding FROM repo_embeddings` returns a binary Buffer, not a JSON array. `SELECT vector_extract(embedding) AS vec` returns the JSON string `[0.1, 0.2, ...]` that `vector()` in a subsequent query accepts.

**Evidence:** `src/app/api/repos/[repoId]/similar/route.ts` lines 70–75.

---

## Search

### FTS5 BM25 `rank` column is negative — ORDER BY rank ASC means best match first

FTS5's `bm25()` function returns negative scores (more negative = better match). The search query orders by `rank ASC` to surface best matches first. This is counterintuitive but correct for FTS5.

**Evidence:** `src/app/api/stars/route.ts` lines 56–76 (BM25 subquery).

---

### GitHub star lists have no official API — require HTML scraping

The GitHub "Starred lists" feature (organizing stars into named lists inside GitHub) has no official API endpoint. `src/lib/github-lists.ts` scrapes GitHub HTML to discover these lists. This is fragile and may break on GitHub layout changes.

**Evidence:** `agents.md` "GitHub star lists via HTML scraping (not official API)"; `src/lib/github-lists.ts`.
