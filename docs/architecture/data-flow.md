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
weekly or manually dispatched seed-popular job
  → complete, creation-date-partitioned GitHub Search identity set
  → diff against all stored D1 repository IDs
  → fetch details and insert source-only additions + initial snapshots
  → bounded embedding and tool-enrichment jobs
  → Vectorize + repo_tools
  → public Discover and Tool Intelligence
```

Discover requests do not synchronously call GitHub. The weekly catalog job is
additions-only: it does not delete or refresh existing repository rows. Growth
uses snapshots captured at ingest or user sync and remains empty when
insufficient samples exist.

## Connected projects

```text
public GitHub URL or owner/repository
  → normalize and check the local catalog
  → require the existing GitHub session token on a catalog miss
  → resolve one public GitHub repository with authenticated quota
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

## Need-driven project intelligence

```text
connected project
  → fingerprint (metadata, tools, AI metadata, topics)
  → need extraction (5–10 evidence-backed needs, cached by fingerprint)
  → per-need retrieval (Vectorize + FTS + structured, cached by signature)
  → candidate classification (5 buckets, confidence, provenance)
  → draft report persistence (versioned, incremental reruns)
  → optional external review ingestion (provider-neutral, idempotent)
```

The need-driven pipeline extends project recommendations from a flat ranked
list to a need-grouped intelligence report. Each need is searched
independently across the full eligible catalog. Candidate pools are cached by
normalized need signature for cross-project reuse. Draft reports are
versioned with `is_latest` flags; degraded runs preserve the latest successful
report. External review ingestion is provider-neutral — Fleet automation owns
Devin credentials and session lifecycle, Starboard only ingests structured
results. See
[need-driven-intelligence.md](need-driven-intelligence.md) for details.
