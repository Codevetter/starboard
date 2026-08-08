# ADR-0007 — Similar-repos reranking: cosine base + topic/language/word boosts

**Date:** 2026-04-25
**Status:** Active

## Context

`vector_top_k` returns candidates by ANN distance. Two repos at cosine distance
0.30 can still differ strongly in language and topic overlap, making the raw ANN
order feel arbitrary.

## Decision

Post-ANN rerank by
`score = (1 - cosine_dist) + topicBoost + languageBoost + wordBoost`. Topic
boost is capped at 0.14 (4 shared topics × 0.035). Language boost is 0.03. Word
boost is capped at 0.04.

## Rationale

Light heuristic re-rank is cheap and exploits structured metadata the embedding
model partially ignores. Cosine similarity stays primary so semantic drift
cannot dominate.

## Alternatives considered

- Cross-encoder rerank (cost + Workers-incompatible).
- Pure cosine (monotone, misses obvious metadata signals).

## Tradeoffs

Boosts are hard-coded and covered by focused similar-repository tests. The
separate removed Fleet recommendation eval harness does not govern this path.

## See also

- [0008-hybrid-rrf-search.md](0008-hybrid-rrf-search.md)
- [../../development/testing.md](../../development/testing.md) — verification
  commands and project recommendation tests.
