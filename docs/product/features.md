# Features

Implemented feature inventory, grouped by product job. For architectural
reasons, see [../architecture/decisions/](../architecture/decisions/).

## Project-aware discovery

- Guests can preview a cataloged public GitHub repository before sign-in using
  stored evidence. An uncataloged lookup requires the user's existing GitHub
  session token so anonymous traffic cannot exhaust a shared quota. Preview
  creates no user-owned row in either case.
- Authenticated users can connect a public GitHub repository by URL or
  `owner/repository`, or choose from a bounded on-demand list of public GitHub
  repositories, without broadening the current OAuth scope.
- Connections are user-owned D1 relations; disconnecting a project does not
  delete shared repository metadata.
- Projects retrieve bounded Vectorize, full-catalog FTS, and language candidate
  lanes before deterministic reranking with visible language, topic, metadata,
  and detected-tool evidence.
- Similar repositories ground tool recommendations. Each recommended tool
  lists the exact peer repositories and detection confidence that support it.
- Recommendation cards state the matching evidence. Sparse-context results are
  explicitly labeled as broad discovery fallbacks and do not generate tool
  recommendations.
- The complete workflow is free and has no billing or entitlement gate.
- Recommendation views, inspections, and useful/not-useful feedback emit only
  categorical buckets; repository identity and query text are excluded.

## Public discovery and tool intelligence

- Discover is public and supports hybrid semantic-plus-lexical relevance
  search with lexical fallback, pagination, language facets, detected-tool
  facets, and stored 30-day growth ordering.
- Tool Intelligence aggregates normalized `repo_tools` records across the
  seeded corpus and, for authenticated users, the personal library.
- Tool evidence is paginated in bounded 48-repository pages and filtered on the
  server, avoiding a 500-card initial render.
- Tool detections preserve category, confidence, and source evidence. The UI
  states that detection is evidence-based but not guaranteed complete.
- Repository detail pages include tool evidence, similar repositories, and
  stored star history where available.

## Personal library

- GitHub OAuth and manual starred-repository sync with ETag caching.
- GitHub list ingestion from public HTML where no official API exists.
- Full-text and relevance search, language and collection filters, URL-backed
  state, grid/list views, and virtual scrolling for large libraries.
- Custom tags, notes, saved state, named collections, compare and bulk actions.
- Public shared lists with SSR and `list.json` exports.

## Search and embeddings

- FTS5 lexical search in D1.
- Shared-RAG relevance search when configured, with lexical fallback when the
  service is unavailable.
- Project-owned Vectorize index (`starboard-repos`, 768-d cosine) for repository
  similarity; D1 stores only embedding drift hashes.
- Bounded README-backed RAG ingest for newly synced repositories.

## Catalog and operations

- Daily and manually dispatched seed, metadata-enrichment, tool-enrichment, and
  embedding jobs with explicit per-run bounds.
- Additive ordered D1 migrations; raw SQL with no ORM.
- Selective core-logic Vitest coverage, Playwright journeys against the actual
  Astro-overlaid Cloudflare preview, Biome checks, docs validation, and
  OpenNext Cloudflare builds.

## Deliberately removed

Alerts, shareable reports, Stack Builder, standalone Radar, weekly digest, and
the checked-in Fleet project catalog were removed to keep Starboard focused on
project-aware discovery and tool intelligence.
