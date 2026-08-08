# Product Surfaces

## Pages

| Route | Purpose | Access |
| --- | --- | --- |
| `/` | Product landing page | Public |
| `/discover` | Search and filter the seeded repository corpus | Public |
| `/explore/[...slug]` | Repository detail, tool evidence, history, and similar repos | Public read; signed-in actions |
| `/tools` | Aggregate tool intelligence | Public |
| `/tools/[toolKey]` | Repositories using a detected tool | Public |
| `/catalog-updates` | Recently cataloged repositories | Public |
| `/about`, `/privacy`, `/terms`, `/changelog` | Product and legal content | Public |
| `/stars` | Personal starred-repository library | Authenticated |
| `/projects` | Connect and list public GitHub projects | Authenticated |
| `/projects/[slug]` | Project context and explained recommendations | Authenticated |
| `/lists/[slug]` | Shared list | Public when shared |

`[slug]` under Projects is the connected repository's numeric GitHub ID. API
ownership checks remain user-scoped regardless of URL knowledge.

## APIs

| Route | Purpose |
| --- | --- |
| `/api/auth/*` | NextAuth GitHub OAuth |
| `/api/stars`, `/api/stars/sync` | Personal library reads and GitHub sync |
| `/api/discover`, `/discover/data` | Public repository discovery |
| `/api/projects` | List and connect user projects |
| `/api/projects/[slug]` | Disconnect an owned project |
| `/api/projects/[slug]/recommendations` | Similar repositories plus tools grounded in exact peer-repository detections |
| `/api/tools` | Tool aggregation |
| `/api/repos/[repoId]/*` | Repository detail mutations, tools, history, and similarity |
| `/api/lists/*` | List CRUD and sharing |
| `/api/growth` | Stored snapshot growth data |
| `/api/catalog-updates` | Catalog ingestion history |
| `/api/embeddings/generate`, `/api/internal/embed-pending` | Authenticated operator paths |
| `/api/health` | Service health |

## Agent-indexing surfaces

Public machine-readable surfaces are `llms.txt`, `llms-full.txt`, `index.md`,
`api/ai`, `api-ai.json`, `robots.txt`, and `sitemap.xml`. Generated edge files
remain governed by the repository conventions and must not be hand-edited.
