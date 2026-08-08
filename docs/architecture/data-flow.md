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
manual seed-popular job
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
  → normalize and resolve through GitHub
  → upsert shared repos row
  → insert user_projects ownership relation
  → load project metadata + repo_tools
  → rank a bounded public-catalog candidate set
  → return recommendations with evidence
```

The route revalidates that the repository is publicly accessible. Project list,
disconnect, and recommendation queries include the signed-in user ID. Sparse
project context produces an explicitly labeled broad-discovery fallback.

## Repository similarity

Repository similarity remains a separate Vectorize path. D1 stores only
`repo_embeddings(repo_id, text_hash)`; vector values live in the
`starboard-repos` index. Similar-project recommendations currently use deterministic
visible evidence so every reason can be explained.
