## Why

Starboard already captures repository star snapshots and threshold events, but the product mostly surfaces a single current star count. Turning those snapshots into visible history, growth rankings, and tool intelligence makes the seeded discovery pool useful for trend spotting rather than only search and rediscovery.

This matters more if the discovery corpus expands to 5k+ repositories: users need ranked momentum and stack/tool summaries to scan a larger corpus without reading every README.

## What Changes

- Add star momentum surfaces for saved/starred repositories and seeded discover repositories:
  - per-repo star history points for compact charts
  - fastest-growing repositories over selectable windows
  - absolute and percentage growth metrics where enough history exists
- Add a repository tool intelligence layer that records tools, frameworks, libraries, platforms, and package managers detected from repository metadata and lightweight source manifests.
- Show aggregate tool usage across the user's library and the discover corpus, with drill-down from a tool to matching repositories.
- Keep the seeded 5k+ corpus practical by using scheduled enrichment, bounded per-run work, and indexed summary tables rather than synchronous GitHub scraping during page loads.
- Reuse existing raw SQL/Turso patterns and current scheduled jobs; no production dependency is required for the first implementation.

## Capabilities

### New Capabilities

- `star-momentum-insights`: Starboard exposes historical star snapshots, growth rankings, and momentum summaries for user and discovery repositories.
- `repo-tool-intelligence`: Starboard detects, stores, aggregates, and displays tools used across repositories.

### Modified Capabilities

- None. Existing dashboard, discover, radar, and stack-builder behavior remains compatible.

## Impact

- Database: add small indexed tables for normalized repo tools and optional enrichment cursors; reuse `repo_star_snapshots` for star history.
- Scheduled scripts: extend the daily seed/enrich path so star snapshots and tool metadata are collected incrementally for the seeded corpus.
- APIs: add or extend read-only endpoints for momentum rankings, per-repo history, and tool usage facets.
- UI: add trend/growth views to Radar or Discover, compact history on repo cards/details, and a tool usage surface linked from dashboard/discover.
- Tests: add deterministic unit tests for growth math and tool detection, plus focused route tests where the repo already has API test coverage.
