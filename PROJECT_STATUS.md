# Project Status

Last updated: 2026-06-04

## Current Scope

Starboard organizes, searches, and rediscovers a user's GitHub starred repositories. The active product is a searchable personal knowledge base with tags, collections, semantic search, filters, and public share pages.

## Done

- GitHub OAuth sync is implemented through NextAuth v5.
- Cloudflare Workers deployment through OpenNext is documented.
- Turso raw SQL and Workers AI embeddings are the current persistence and semantic-search path.
- Core features include smart categories, custom tags, collections, full-text search, filters/sort, grid/list views, virtual scroll, and manual sync.
- GitHub star ingestion uses ETag caching and HTML scraping where needed.
- Scheduled Actions seed and enrich popular repositories for discovery surfaces.
- Audit residuals and operational risks are documented.

## Planned Next

1. Stabilize scheduled Actions so seed/enrichment and digest workflows stay green.
2. Add a checked-in `.env.example` that documents required local variables without secrets.
3. Improve semantic-search transparency so users can understand why a repository matched.
4. Keep sync, tag, and collection flows fast enough for large star libraries.

## Deferred / Parked

- Organization/team dashboards are deferred.
- General GitHub analytics beyond starred-repo rediscovery is parked.
- Provider expansion beyond GitHub is deferred.
