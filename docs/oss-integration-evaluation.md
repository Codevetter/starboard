# OSS Integration Evaluation

Last updated: 2026-06-09

## Scope

Evaluate OSS integrations that could improve Starboard's My Projects repository
recommendations without replacing the current Next.js, Turso/libSQL, Workers AI,
and deterministic project-snapshot flow.

## Shortlist

| Candidate | Source | Fit | Cost | Decision |
| --- | --- | --- | --- | --- |
| Orama | https://github.com/oramasearch/orama | Edge-friendly full-text, vector, and hybrid search in TypeScript. Strong fit if My Projects needs an in-process recommendation index for project snapshots or offline demos. | Medium: duplicates some Turso search/indexing state and license is custom/Other in GitHub metadata. | Watchlist. Prototype only if Turso text/vector ranking becomes the bottleneck. |
| LanceDB | https://github.com/lancedb/lancedb | Strong hybrid search and reranking model, including RRF-style rerankers. Good reference for evaluation shape. | High: introduces a separate embedded/vector store and Python/Rust-adjacent operational surface. | Use as design reference, not dependency. |
| Tantivy | https://github.com/quickwit-oss/tantivy | Mature Rust full-text engine. Useful if Starboard ever extracts ranking into a local/indexing worker. | High for current TypeScript Cloudflare app. | Park. Not a good fit for current Workers runtime. |
| ort | https://github.com/pykeio/ort | Rust ONNX runtime for local cross-encoder reranking. | High: model packaging, cold-start, and Workers compatibility are unclear. | Park until a local/offline Starboard worker exists. |
| Outlines | https://github.com/dottxt-ai/outlines | Could make recommendation explanations more structured when LLMs are used. | Medium/high and Python-first; Starboard currently avoids LLM explanations in the critical path. | No dependency. Keep deterministic explanations first. |
| RRF / hybrid reranking pattern | LanceDB docs: https://lancedb.github.io/lancedb/hybrid_search/hybrid_search/ | Immediate fit for combining lexical, tag/category, and embedding-distance signals. | Low: can be implemented inside the existing scorer. | Recommended next slice. Add a fixture-backed ranking eval before changing production ranking. |

## Decision

Do not add a new search engine or vector store yet. Starboard already has
Turso-backed repository metadata, optional repo embeddings, deterministic
project snapshots, and unit tests around search/recommendation behavior. The
highest-ROI next step is a local ranking evaluation harness that compares the
current scorer to a small RRF-style fusion of:

- project keyword overlap
- repo metadata/category overlap
- existing embedding-distance boost when available
- installed-package suppression

Only consider Orama or LanceDB after that harness shows the current storage path
cannot express the desired ranking behavior.

## Suggested Implementation Slice

1. Add a fixture of 3-5 fleet project contexts and 20-40 saved repositories.
2. Record expected top recommendations and explanation reasons.
3. Add an RRF-style scorer variant behind a test-only function or feature flag.
4. Compare top-k hit rate and explanation clarity before wiring UI changes.

## Verification

Docs-only evaluation in this pass. Run:

```bash
pnpm test
pnpm typecheck
```
