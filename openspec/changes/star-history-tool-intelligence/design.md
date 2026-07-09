## Context

Current Starboard already has the core primitives for part of this feature:

- `repo_star_snapshots(repo_id, stargazers_count, captured_at)` stores point-in-time star counts.
- `repo_threshold_events` stores threshold crossings.
- `scripts/seed-popular.ts` upserts seeded popular repos and writes star snapshots during scheduled runs.
- `scripts/weekly-threshold-digest.ts` already computes fastest growers from snapshots for a GitHub issue body.
- `/api/radar` and `src/lib/release-radar.ts` already compute a 30-day star delta for the authenticated user's library.

The missing pieces are productized read APIs, reusable growth math, UI surfaces, and a durable representation of tools used across repos. Tool usage is broader than GitHub's single `language` field: it should include frameworks, libraries, package managers, cloud platforms, test tools, databases, and AI tooling when available.

## Goals / Non-Goals

**Goals:**

- Show star history and growth rate in Starboard UI without depending on a third-party chart service at render time.
- Rank fastest-growing repositories across the user's library and the seeded discover corpus.
- Support a 5k+ seeded corpus with bounded scheduled work and indexed reads.
- Detect common tools from the strongest available evidence first: GitHub SBOM when available, repository tree discovery, targeted package/build manifests, repo metadata, topics, README text, and existing AI metadata.
- Make tool usage filterable and explainable: each tool should have a category, confidence, source, and repo count.
- Accept that accuracy varies by ecosystem, and expose that variation through source/confidence rather than presenting every detection as equally certain.

**Non-Goals:**

- Full dependency graph indexing for every repository on every sync.
- Real-time GitHub stargazer event ingestion.
- Organization/team analytics.
- Paid API dependency for the initial implementation.
- Perfect SBOM accuracy. The first version is a product intelligence index, not a security inventory.

## Decisions

### 1. Use internal snapshots as the canonical star history

Use `repo_star_snapshots` for all product growth metrics. External free stargazer graph URLs can be linked as an optional outbound reference later, but Starboard should not require them for charts or rankings.

Rationale: the existing scheduled seed path already writes snapshots, and the data is local, queryable, and testable. Third-party charts are useful for visual comparison, but they are not an API contract and do not solve authenticated/library-specific ranking.

Alternative considered: scrape or embed a third-party star-history chart. This is lower effort for a single repo but brittle for sorting, filtering, API responses, and 5k-corpus analytics.

### 2. Extract growth calculations into a reusable library

Move growth-window math out of scripts into a shared module, for example `src/lib/star-growth.ts`. The module should accept snapshot rows and return:

- first and last sample in the requested window
- stars gained
- percent growth when the first sample is greater than zero
- per-day growth rate
- enough-history flag

Rationale: Radar, Discover, weekly digest, and tests should share one definition of "fastest growing."

Alternative considered: duplicate SQL/window logic per endpoint. That is fast initially but makes threshold digests, UI, and tests drift.

### 3. Add a normalized repo tool table

Add `repo_tools` as a compact table:

- `repo_id`
- `tool_key` normalized lowercase identifier such as `react`, `next`, `vitest`
- `tool_name` display label
- `category` such as `framework`, `library`, `database`, `testing`, `cloud`, `ai`, `package-manager`, `language`
- `confidence` integer 0-100
- `sources` JSON array, for example `["package.json", "topics", "readme"]`
- `detected_at`
- primary key on `(repo_id, tool_key)`

Add indexes for `(tool_key)`, `(category, tool_key)`, and `(repo_id)`.

Rationale: aggregating directly from JSON blobs or READMEs will be slow and hard to filter at 5k+ repos. A normalized table keeps pages cheap and supports drill-down.

Alternative considered: store tools as a JSON column on `repos`. This is simpler but worse for counting, filtering, updates, and confidence/source metadata.

### 4. Use staged, low-cost tool detection

First pass detection should use signals already available or cheap to fetch, in descending evidence quality:

- GitHub SBOM export when available for a public or readable repository
- recursive Git tree listing to discover manifest/build files without cloning
- targeted manifest/build files:
  - JavaScript/TypeScript: `package.json`, lockfiles, workspace config
  - Python: `pyproject.toml`, `requirements.txt`, `uv.lock`, `poetry.lock`
  - Rust: `Cargo.toml`, `Cargo.lock`
  - Go: `go.mod`, `go.sum`
  - JVM: `pom.xml`, `build.gradle`, `build.gradle.kts`
  - .NET: `*.csproj`, `*.fsproj`, `*.sln`
  - Ruby/PHP/Swift: `Gemfile`, `composer.json`, `Package.swift`
  - C/C++: `CMakeLists.txt`, `conanfile.*`, `vcpkg.json`, `meson.build`, `WORKSPACE`, `MODULE.bazel`
  - Infra/app platforms: `Dockerfile`, `docker-compose.yml`, Terraform files, GitHub Actions, `wrangler.jsonc`, Vercel/Netlify/Fly/Railway config
- GitHub language and topics
- existing `repo_ai_metadata` category/keywords/use cases
- README text when already fetched for RAG ingestion

The scheduled enrichment job should process a bounded batch per run, track stale/missing rows, and skip synchronous detection during UI requests.

Rationale: the system can grow to 5k repositories without user-facing page loads paying network costs or hitting GitHub rate limits.

Alternative considered: clone every repository or use GitHub code search. Cloning is too expensive for routine refreshes, while code search has tighter limits and poorer exhaustiveness for this use case. Tree listing plus targeted manifest fetches gives the best cost/accuracy trade-off.

### 5. Treat confidence as a product contract

Store a confidence score and source evidence for every detected tool. Suggested bands:

- 95-100: GitHub SBOM or lockfile/package-manager manifest names the dependency.
- 85-94: primary manifest/build file names the tool or package, for example `package.json`, `go.mod`, `Cargo.toml`, `pom.xml`, or `CMakeLists.txt`.
- 65-84: build file references a known integration pattern, for example CMake `find_package`, Bazel module, GitHub Actions setup action, Docker base image, or cloud config.
- 35-64: README, topics, repo language, or AI metadata implies use.

C/C++ should be treated as lower certainty unless a package manager manifest or clear build-system directive is present. A repo can have multiple tools at different confidence levels.

Rationale: Starboard should be accurate enough to support product decisions and trend scanning, while being transparent about where the detector has weaker evidence.

### 6. UI placement

Use existing operational surfaces:

- Radar: add fastest-growers and compact star momentum because it already owns momentum/maintenance signals.
- Discover: add `growth` sort and tool facets for the seeded corpus.
- Explore detail: add a compact star history chart/table and detected tools.
- A new `/tools` route is reasonable once aggregate tool usage deserves a dedicated page; first implementation can land as a dashboard section if scope needs to stay smaller.

Rationale: this keeps the first version close to current user flows and avoids inventing a broad analytics dashboard before the data proves useful.

## Risks / Trade-offs

- [Sparse history] New repos or newly seeded repos may have only one snapshot. -> Show "collecting history" and exclude them from growth-rate rankings until at least two samples exist.
- [Snapshot volume] 5k repos with daily snapshots is manageable but grows over time. -> Add retention/downsampling if snapshots exceed practical query volume, for example keep daily points for 180 days and weekly points afterward.
- [GitHub rate limits] Manifest fetching across 5k repos can exceed available quota. -> Bound per-run detection, prioritize saved/starred and high-star repos, and cache source hashes.
- [Tool false positives] Topics and README keywords can misclassify tools. -> Store confidence and source, and distinguish inferred tools from manifest-confirmed tools.
- [Ecosystem variance] JavaScript/Rust/Go/JVM manifests are usually direct; C/C++ and infra repos are more ambiguous. -> Present confidence/source labels, and allow aggregate views to filter to high-confidence detections.
- [UI density] Growth and tools can clutter repo cards. -> Use compact badges/sparklines and put detailed history/tools on Radar, Discover, or Explore detail.

## Migration Plan

1. Add schema for `repo_tools` and a tool-enrichment cursor without changing existing reads.
2. Backfill tools in a capped scheduled/manual script using existing repo metadata and manifests.
3. Add read-only APIs and UI surfaces behind default-safe empty states.
4. Once tool coverage is high enough, add Discover tool facets and growth sort.
5. Optional later: add retention/downsampling for old star snapshots if production data volume warrants it.

Rollback is straightforward for product code: remove UI links/endpoints and leave the additive tables unused. Schema additions are non-breaking.

## Open Questions

- Should the first dedicated UI be a `/tools` route, or should tool intelligence start as a Radar/Discover section?
- What retention policy should apply once snapshots have more than 6-12 months of daily data?
- Should "expand to 5k" mean the current `MIN_STARS_FLOOR=5000` seeded pool, a hard cap of 5k repos, or both?
- Should the tool detector fetch manifests only for public seeded repos, or also for every authenticated user's private saved/starred repo if GitHub permissions allow it?
