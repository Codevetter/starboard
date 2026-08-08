## MODIFIED Requirements

### Requirement: Similar repositories ground tool recommendations

The system SHALL retrieve candidate peers from the eligible public catalog,
rank similar repositories before recommending tools, and derive each
recommended tool only from normalized detections on those ranked peers.

#### Scenario: Semantic and lexical evidence are available

- **WHEN** a project has enough public context for both retrieval paths
- **THEN** Starboard combines bounded semantic and lexical candidates from the
  eligible catalog before deterministic evidence reranking

#### Scenario: Semantic retrieval is unavailable

- **WHEN** the semantic index or embedding path cannot serve a project
- **THEN** Starboard uses bounded lexical and structured catalog candidates and
  labels any broad fallback honestly

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

## ADDED Requirements

### Requirement: Explain retrieval and recommendation strength

Starboard SHALL expose enough non-sensitive context for a user to distinguish a
specific grounded recommendation from a degraded or broad result.

#### Scenario: Grounded tool is shown

- **WHEN** Starboard recommends a tool from similar repositories
- **THEN** the interface shows peer support, source confidence, and a direct
  path to inspect the existing Tool Intelligence detail

#### Scenario: Candidate retrieval degrades

- **WHEN** one retrieval source is unavailable
- **THEN** the result describes the retrieval mode without claiming a stronger
  semantic match than the system produced

### Requirement: Privacy-safe recommendation feedback

Starboard SHALL let a user mark repository and tool recommendations useful or
not useful without sending repository identity or free-form text to analytics.

#### Scenario: User rates a recommendation

- **WHEN** a user selects useful or not useful
- **THEN** Starboard records only recommendation kind, sentiment, rank bucket,
  retrieval mode, and aggregate evidence buckets
