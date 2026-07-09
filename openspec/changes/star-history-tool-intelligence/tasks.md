## 1. Data Model And Shared Logic

- [x] 1.1 Add additive schema for normalized `repo_tools` rows and any cursor/state needed for bounded enrichment.
- [x] 1.2 Extract reusable star-growth calculations into `src/lib/star-growth.ts`.
- [x] 1.3 Add deterministic tests for star-growth windows, sparse histories, percent growth, and tie-break ordering.
- [x] 1.4 Add a tool detector module with normalized tool keys, categories, confidence, and source tracking.
- [x] 1.5 Add parsers for the first manifest/build set: `package.json`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, JVM build files, `.csproj`, `Gemfile`, `composer.json`, `Package.swift`, `CMakeLists.txt`, `conanfile.*`, `vcpkg.json`, `meson.build`, Bazel files, Docker/config files, and GitHub Actions.
- [x] 1.6 Add tests for manifest-confirmed, C/C++ build-file, SBOM-backed, and metadata-inferred tool detection.

## 2. Scheduled Collection

- [ ] 2.1 Update the seeded repo path so 5k+ corpus snapshots remain conflict-safe and bounded.
- [x] 2.2 Add recursive tree discovery so enrichment fetches only relevant manifests/build files instead of cloning repositories.
- [x] 2.3 Add a capped tool-enrichment script that prioritizes saved/starred repos and high-star seeded repos.
- [x] 2.4 Try GitHub SBOM export when available, then fall back to tree-discovered manifest fetches.
- [ ] 2.5 Reuse existing README/RAG metadata when available before making GitHub manifest requests.
- [x] 2.6 Add logging for processed, skipped, stale, failed, and rate-limited tool-enrichment rows.

## 3. Read APIs

- [x] 3.1 Add a read-only API for per-repo star history points.
- [x] 3.2 Add a read-only API for fastest-growing repositories with window, scope, and ranking mode parameters.
- [x] 3.3 Add a read-only API for aggregate tool usage and tool drill-down.
- [x] 3.4 Add confidence/source filters to tool usage APIs.
- [x] 3.5 Return stable tool reference links and larger bounded repository drill-downs from tool APIs.
- [x] 3.6 Add repository language facets and multi-language filters to tool usage APIs.
- [ ] 3.7 Extend Discover API support for `growth` sorting and tool facets when data exists.

## 4. UI Surfaces

- [x] 4.1 Add fastest-grower and star-history UI to Radar or Discover using stored snapshot data.
- [x] 4.2 Add compact star history and detected tool badges to repository detail.
- [x] 4.3 Add aggregate tool usage UI, initially as a focused section or `/tools` route.
- [x] 4.4 Show detection source/confidence labels so mixed-stack accuracy is visible.
- [x] 4.5 Add empty states for collecting history and no detected tools.
- [x] 4.6 Add dedicated clickable `/tools/[toolKey]` pages with reference links and repository lists.
- [x] 4.7 Make repository-detail tool badges link to the matching tool page.
- [x] 4.8 Add language multi-select filtering to aggregate and per-tool pages.

## 5. Verification And Rollout

- [x] 5.1 Run focused Vitest coverage for growth and tool detection modules.
- [ ] 5.2 Run route-level or integration checks for new read APIs.
- [x] 5.3 Run `pnpm typecheck` and the smallest relevant build check after UI wiring.
- [ ] 5.4 Archive this OpenSpec change after the remaining follow-up tasks are complete.
