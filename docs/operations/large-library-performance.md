# Large-library performance

Starboard's signed-in library paths are designed for users with 1,000 or more
stars. This page records the bounded profile completed on 2026-07-31 and the
guardrails that keep those paths responsive.

## Profile

The review covered a 1,000-repo sync and dashboard, collection assignment,
facets, and a 2,000-candidate project recommendation run.

- The repository grid renders virtual rows with five rows of overscan instead
  of mounting the whole library.
- The stars API returns at most 200 repos per page. Count, language, and
  collection facets run in parallel over indexed user/list columns.
- Collection assignment is a primary-key upsert over
  `(user_id, repo_id, list_id)`. Legacy tags were removed in favor of named
  collections, so there is no separate tag path to profile.
- A local synthetic 2,000-candidate recommendation profile completed with a
  27.58 ms median and 27.99 ms p95 across 30 warmed runs. The API also caps the
  candidate query at 2,000 rows and the response at 30 recommendations.
- The initial sync was the outlier: it generated embeddings and fetched a
  README for every newly imported repo before returning. The sync result also
  rendered every added or removed repository name.

## Guardrails

- Core sync persists the GitHub diff and collections before enrichment.
- Embeddings use the existing post-sync generation path instead of blocking the
  core sync response.
- A sync fetches at most 25 READMEs synchronously. Every added repo is still
  ingested into shared RAG; repos outside that bound use repository metadata.
- Added/removed feedback renders at most eight repository names plus a remaining
  count.
- `src/__tests__/sync-performance.test.ts` fixes the 1,000-repo bounds in the
  regression suite.

The profile is intentionally local and synthetic; it validates algorithmic and
render bounds without reading production user data or credentials.

