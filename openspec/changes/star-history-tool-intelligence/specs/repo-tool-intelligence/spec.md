## ADDED Requirements

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
