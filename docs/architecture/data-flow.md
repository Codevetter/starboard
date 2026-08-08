# Data Flow

## Star library

```text
GitHub OAuth token
  → paginated starred repositories + public GitHub lists
  → repos + user_repos + user_lists + user_repo_lists in D1
  → FTS/RAG search, tags, notes, collections, compare, and saved state
```

GitHub sync uses ETags and bounded README ingest. Personal rows are always
filtered by `session.user.githubId`.

## Public discovery

```text
daily or manually dispatched seed-popular job
  → GitHub Search metadata
  → repos + star snapshots in D1
  → bounded embedding and tool-enrichment jobs
  → Vectorize + repo_tools
  → public Discover and Tool Intelligence
```

Discover requests do not synchronously call GitHub. Growth uses stored snapshot
history and remains empty when insufficient samples exist.

## Connected projects

```text
public GitHub URL or owner/repository
  → normalize and check the local catalog
  → resolve one public GitHub repository on a catalog miss
  → public preview: no user-owned write
  → authenticated connection only after explicit confirmation
  → upsert shared repos row
  → insert user_projects ownership relation
  → load project metadata + repo_tools
  → retrieve bounded Vectorize + full-catalog FTS + language candidates
  → reciprocal-rank fusion + deterministic evidence reranking
  → return recommendations, retrieval mode, and peer-grounded tools
```

The route revalidates that the repository is publicly accessible. Project list,
disconnect, and recommendation queries include the signed-in user ID. Sparse
project context produces an explicitly labeled broad-discovery fallback.

## Repository similarity

Repository similarity remains a separate Vectorize path. D1 stores only
`repo_embeddings(repo_id, text_hash)`; vector values live in the
`starboard-repos` index. Project-aware recommendations use Vectorize as one
candidate lane, then fuse it with full-catalog lexical and structured lanes.
Deterministic visible evidence remains the final ranker so every reason can be
explained. When semantic retrieval is unavailable, lexical and structured lanes
remain usable; an all-lanes-empty state becomes an explicit broad fallback.
