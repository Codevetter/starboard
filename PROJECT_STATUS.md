# Project Status

Last updated: 2026-06-09

## Current Scope

Starboard organizes, searches, and rediscovers a user's GitHub starred repositories. The active product is a searchable personal knowledge base with tags, collections, semantic search, filters, public share pages, and fleet-aware repository recommendations for current SaaS Maker projects.

## Done

- GitHub OAuth sync is implemented through NextAuth v5.
- Cloudflare Workers deployment through OpenNext is documented.
- Turso raw SQL and Workers AI embeddings are the current persistence and semantic-search path.
- Core features include smart categories, custom tags, collections, full-text search, filters/sort, grid/list views, virtual scroll, and manual sync.
- GitHub star ingestion uses ETag caching and HTML scraping where needed.
- Scheduled Actions seed and enrich popular repositories for discovery surfaces.
- My Projects is implemented as a Starboard helper workflow: a local snapshot extractor reads current fleet project context, and production Starboard ranks the user's saved/starred repositories against each project.
- Project recommendations are grouped by inferred feature area, suppress dependencies already used by the selected project, and use deterministic scoring with optional embedding-distance boosts when repo embeddings are available.
- OSS recommendation integrations were evaluated in `docs/oss-integration-evaluation.md`; the current decision is no new search/vector dependency yet, and the next slice is a fixture-backed RRF-style ranking eval inside the existing Turso/Workers AI flow.
- Audit residuals and operational risks are documented.

## Planned Next

1. Stabilize scheduled Actions so seed/enrichment and digest workflows stay green.
2. Add a checked-in `.env.example` that documents required local variables without secrets.
3. Add a fixture-backed My Projects ranking evaluation harness before changing recommendation scoring.
4. Keep sync, tag, collection, and project recommendation flows fast enough for large star libraries.

## Deferred / Parked

- Organization/team dashboards are deferred.
- General GitHub analytics beyond starred-repo rediscovery is parked.
- Provider expansion beyond GitHub is deferred.
