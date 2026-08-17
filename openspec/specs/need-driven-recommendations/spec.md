# need-driven-recommendations Specification

## Purpose
Define how Starboard extracts evidence-backed project needs, searches the
eligible repository catalog independently for each need, classifies candidates,
and optionally ingests an external review to finalize a project intelligence
report.
## Requirements
### Requirement: Extract evidence-backed project needs

Starboard SHALL fingerprint a connected project from approved evidence and
produce a stable need map with 5–10 non-duplicative needs, returning fewer when
evidence is insufficient.

#### Scenario: Fingerprint is unchanged

- **WHEN** a project is analyzed again and its input fingerprint matches the
  stored fingerprint
- **THEN** Starboard reuses the existing need map instead of re-extracting needs

#### Scenario: Need map changes

- **WHEN** the fingerprint or extracted needs change
- **THEN** Starboard marks downstream retrieval and review stages as stale

#### Scenario: Insufficient evidence

- **WHEN** a project has fewer than five distinct supported needs
- **THEN** Starboard returns the supported needs and records the shortfall

### Requirement: Search the catalog independently per need

Starboard SHALL generate focused search intents per need and query the full
eligible catalog using semantic, lexical, and structured lanes.

#### Scenario: Vectorize is available

- **WHEN** the need has semantic search intents and Vectorize is reachable
- **THEN** Starboard returns bounded semantic candidates with distance metadata

#### Scenario: Vectorize is unavailable

- **WHEN** Vectorize or the embedding path fails
- **THEN** Starboard continues with lexical and structured candidates and marks
  the retrieval mode accordingly

#### Scenario: Need-specific retrieval is cached

- **WHEN** a normalized need signature, project constraints, retrieval version,
  and catalog generation already have a stored candidate pool
- **THEN** Starboard reuses the pool and skips the search lanes for that need

### Requirement: Classify recommendations

Starboard SHALL classify each candidate into one of five buckets and include
relevance evidence, constraints, risks, maintenance signals, confidence, and
provenance.

#### Scenario: Candidate is suitable to adopt

- **WHEN** a candidate matches the need, is actively maintained, has a compatible
  license/stack, and has credible adoption signals
- **THEN** Starboard classifies it as `adopt_or_integrate` with confidence and
  evidence

#### Scenario: Candidate is a reference implementation

- **WHEN** a candidate demonstrates how to solve the need but is not a direct
  dependency
- **THEN** Starboard classifies it as `reference_implementation`

#### Scenario: Candidate is a competing product

- **WHEN** a candidate solves the same end-user problem as the project
- **THEN** Starboard classifies it as `competing_product_to_monitor`

#### Scenario: Candidate is unsuitable

- **WHEN** a candidate conflicts with the project's constraints, is archived,
  unmaintained, or otherwise unsuitable
- **THEN** Starboard classifies it as `unsuitable_negative_example` with rationale

### Requirement: Produce deterministic draft reports

Starboard SHALL persist a draft report grouped by need with evidence,
classification, confidence, and provenance.

#### Scenario: Draft report is complete

- **WHEN** all needs have been evaluated
- **THEN** Starboard stores the draft report and exposes a processing state of
  `complete` or `awaiting_review`

#### Scenario: Some retrieval failed

- **WHEN** one or more needs cannot be evaluated
- **THEN** Starboard keeps the successful needs, marks the report as
  `degraded`, and preserves the latest successful report

### Requirement: Optional external review

Starboard SHALL expose a provider-neutral contract for submitting a bounded
review package and ingesting a structured review result.

#### Scenario: External reviewer rejects a need

- **WHEN** a reviewer returns a verdict that a need is unsupported
- **THEN** Starboard removes or downgrades that need in the reviewed report and
  records the rationale

#### Scenario: External reviewer removes weak candidates

- **WHEN** a reviewer returns a verdict that removes candidates
- **THEN** Starboard updates the reviewed report and keeps the deterministic
  draft as the fallback source

#### Scenario: Review ingestion is idempotent

- **WHEN** the same review result is submitted twice with the same idempotency
  key
- **THEN** Starboard ignores the duplicate and returns the existing reviewed
  report

### Requirement: Read persisted reports without triggering agent spend

Starboard SHALL let UI, API, and MCP callers read the latest draft or reviewed
report without invoking external reviewers or re-running retrieval.

#### Scenario: UI requests a project report

- **WHEN** a caller requests a project's intelligence report
- **THEN** Starboard returns the persisted report and does not start a Devin
  session or search the catalog

### Requirement: First Fleet project intelligence report

Starboard SHALL provide an offline script that runs the deterministic pipeline
for every high-priority Fleet project and emits a structured Markdown report.

#### Scenario: Script runs with Fleet catalog

- **WHEN** `scripts/fleet-project-intelligence.ts` executes with the Fleet
  `projects.json`
- **THEN** it produces a report with needs, candidates, classifications,
  evidence, and provenance for each P1/P2 maintained project

#### Scenario: Script fails safely

- **WHEN** the script encounters an error for a project or a retrieval stage
- **THEN** it records the failure, continues with other projects, and does not
  overwrite the latest successful report

