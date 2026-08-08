# Architecture Overview

Starboard is a Next.js App Router application deployed to Cloudflare Workers
through OpenNext. D1 stores relational and full-text data, Vectorize stores
768-dimensional repository vectors, Workers AI creates embeddings, and an
optional shared `knowledgebase` Worker provides relevance search.

See [data-flow.md](data-flow.md) for the sync, catalog, and connected-project
lifecycles.

```text
Browser
  ├── public: landing, Discover, Tools, repository details, shared lists
  └── authenticated: Library, Projects, user mutations
        │
        ▼
Next.js route handlers on Cloudflare Workers
  ├── GitHub OAuth + public repository metadata
  ├── D1: users, repos, user_repos, user_projects, lists, tool evidence
  ├── Vectorize: repository similarity vectors
  ├── Workers AI: embedding generation
  └── optional knowledgebase service: relevance search
```

## Runtime boundaries

- Worker routes use the direct `DB` binding through `src/db/index.ts`.
- Node operator jobs use the authenticated D1 REST adapter.
- Vector writes use the `REPO_VECTORS` Worker binding or the scoped operator
  path. No public raw-SQL proxy exists.
- GitHub OAuth remains `read:user`. Connected projects are public repositories;
  private access is not inferred from session availability.

## Product modules

- `src/app/discover/` and `src/app/api/discover/` — public corpus search.
- `src/app/projects/` and `src/app/api/projects/` — user project connections and
  recommendations.
- `src/lib/github-projects.ts` — GitHub project input and public resolution.
- `src/lib/project-recommendations.ts` — pure evidence-based ranking.
- `src/lib/connected-projects.ts` — connected-project row mapping.
- `src/lib/repo-tools.ts` and `scripts/enrich-tools.ts` — tool normalization and
  enrichment.
- `src/app/stars/`, `src/hooks/`, and library components — personal star
  organization.

## Data contracts

- `EMBEDDING_DIM=768` must match the `starboard-repos` Vectorize index.
- `user_projects` is a `(user_id, repo_id)` relation over the shared `repos`
  catalog.
- Tool evidence is additive in `repo_tools`; absence means unknown, not that a
  project does not use a tool.
- Popularity can break ties in similar-project recommendations but is not presented as
  project-match evidence.

## Generated files

`worker.mjs`, `agent-edge.mjs`, `cloudflare-env.d.ts`, and other documented
build artifacts follow [../development/conventions.md](../development/conventions.md).
