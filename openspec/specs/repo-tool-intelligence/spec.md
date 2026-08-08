# repo-tool-intelligence Specification

## Purpose
TBD - created by archiving change star-history-tool-intelligence. Update Purpose after archive.
## Requirements
### Requirement: Repository tool detection
The system SHALL detect tools used by repositories and store normalized tool records with category, confidence, and source metadata.

#### Scenario: Tree-based manifest discovery
- **WHEN** the enrichment job inspects a repository
- **THEN** the system discovers relevant manifest and build files from the repository tree before fetching file contents

#### Scenario: Manifest-confirmed tool
- **WHEN** a repository manifest includes a known dependency such as `react`, `next`, or `vitest`
- **THEN** the system stores a tool record with a high confidence score and a manifest source

#### Scenario: C and C++ build evidence
- **WHEN** a repository contains C/C++ build files such as `CMakeLists.txt`, `conanfile.*`, `vcpkg.json`, `meson.build`, `WORKSPACE`, or `MODULE.bazel`
- **THEN** the system detects build systems and package-manager evidence with confidence based on the specific directive or manifest source

#### Scenario: SBOM evidence
- **WHEN** GitHub SBOM export is available for a repository
- **THEN** the system uses SBOM packages as high-confidence dependency evidence while still preserving source metadata

#### Scenario: Metadata-inferred tool
- **WHEN** repository topics, language, README text, or AI metadata imply a tool or platform
- **THEN** the system stores a tool record with an inference source and lower confidence than manifest-confirmed tools

### Requirement: Evidence-aware accuracy
The system SHALL expose detection confidence and source evidence so users can interpret tool accuracy across different languages and frameworks.

#### Scenario: Mixed ecosystem accuracy
- **WHEN** aggregate tool usage includes tools detected from different ecosystems
- **THEN** the system distinguishes high-confidence manifest/SBOM detections from lower-confidence README/topic/metadata inferences

#### Scenario: High-confidence filtering
- **WHEN** a user or API consumer requests only high-confidence tool usage
- **THEN** the system excludes lower-confidence inferred records from the aggregate result

### Requirement: Tool usage aggregation
The system SHALL aggregate detected tools across the user's library and the seeded discover corpus.

#### Scenario: Aggregate tool counts
- **WHEN** a user opens a tool usage surface
- **THEN** the system shows tools grouped by category with repository counts

#### Scenario: Tool drill-down
- **WHEN** a user selects a tool
- **THEN** the system shows repositories using that tool and includes the detection source or confidence where practical

### Requirement: Tool facets for discovery
The system SHALL allow users to filter or sort discovery results by detected tools once tool data exists for the corpus.

#### Scenario: Tool facet is selected
- **WHEN** a user selects a tool facet in Discover
- **THEN** the repository query returns only repositories with matching normalized `repo_tools` rows

### Requirement: Bounded enrichment
The system SHALL collect tool intelligence through scheduled or manual enrichment jobs with explicit per-run limits.

#### Scenario: Tool enrichment runs
- **WHEN** the enrichment job runs against the seeded corpus
- **THEN** it processes a bounded number of missing or stale repositories and records progress without delaying user-facing requests

### Requirement: Connected project tool context

The system SHALL use available detected-tool records for a connected project as
recommendation context while preserving confidence and evidence limitations.

#### Scenario: Project has detected tools

- **WHEN** a connected project has normalized tool records
- **THEN** project recommendations may use matching tool categories or tools and
  state those matches in their explanations

#### Scenario: Project has no detected tools

- **WHEN** a connected project has not been enriched or has no reliable tool
  records
- **THEN** project recommendations continue with other repository evidence and
  do not claim a tool match

### Requirement: Similar repositories ground tool recommendations

The system SHALL rank similar repositories before recommending tools and SHALL
derive each recommended tool only from normalized detections on those ranked
peer repositories.

#### Scenario: Peer repositories contain additional tools

- **WHEN** grounded similar repositories contain detected tools not already
  detected in the connected project
- **THEN** Starboard recommends those tools with the exact peer repositories
  and detection confidence that support the recommendation

#### Scenario: Tool is already used by the connected project

- **WHEN** a peer repository contains a tool already detected in the connected
  project
- **THEN** Starboard omits that tool from the additions it recommends

#### Scenario: Only broad fallback repositories are available

- **WHEN** no project-specific similarity signal exists
- **THEN** Starboard may show broad repository discovery but SHALL NOT present
  tools from those repositories as grounded recommendations
