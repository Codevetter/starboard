# popular-catalog-reconciliation Specification

## Purpose
Keep Starboard's shared popular-repository catalog complete through a bounded,
auditable reconciliation that writes only newly discovered repositories.
## Requirements
### Requirement: Weekly complete source enumeration
Starboard SHALL enumerate the complete public GitHub repository set at or above
the configured star floor in one weekly reconciliation run.

#### Scenario: Scheduled reconciliation runs
- **WHEN** the weekly catalog workflow starts
- **THEN** it enumerates every source partition needed to cover the configured
  star floor before performing a database write

#### Scenario: Source exceeds one search result window
- **WHEN** the eligible source corpus exceeds GitHub Search's per-query result
  window
- **THEN** the reconciliation partitions the source into non-overlapping ranges
  whose complete results fit within one response

### Requirement: Source completeness is fail-closed
Starboard MUST reject source evidence that is incomplete, duplicated, unstable,
or inconsistent with GitHub's reported eligible count.

#### Scenario: GitHub marks a response incomplete
- **WHEN** any source response reports incomplete results
- **THEN** the reconciliation fails before writing to D1

#### Scenario: Enumerated identities do not reconcile
- **WHEN** the unique repository ID count differs from the stable source count
  or a repository appears in more than one non-overlapping partition
- **THEN** the reconciliation fails before writing to D1

### Requirement: Reconciliation is additions-only
Starboard SHALL compare the complete source identity set with all repository IDs
already stored in D1 and SHALL insert only source repositories absent from D1.

#### Scenario: Repository already exists
- **WHEN** a source repository ID is already present in D1
- **THEN** the weekly reconciliation does not update or rewrite that repository

#### Scenario: Repository is new
- **WHEN** a source repository ID is absent from D1
- **THEN** Starboard fetches current repository metadata and inserts it through
  the existing catalog, snapshot, threshold-event, embedding, and enrichment
  paths

#### Scenario: Stored repository is absent upstream
- **WHEN** a stored repository ID is not present in the current source set
- **THEN** the reconciliation records the difference but does not delete data

### Requirement: D1 budget is protected before writes
Starboard MUST apply a configured maximum-additions circuit breaker after the ID
diff and before fetching or writing addition details. The configured value MUST
NOT exceed the code-level Cloudflare budget safety limit.

#### Scenario: Additions are within the bound
- **WHEN** the source-only ID count is at or below the configured bound
- **THEN** the reconciliation may insert the additions in bounded batches

#### Scenario: Additions exceed the bound
- **WHEN** the source-only ID count exceeds the configured bound
- **THEN** the reconciliation fails without inserting, updating, or deleting a
  repository

#### Scenario: Configured bound exceeds the hard limit
- **WHEN** a scheduled or manual run configures an additions bound above the
  code-level safety limit
- **THEN** the reconciliation fails before GitHub or D1 access

### Requirement: Reconciliation evidence is explicit
Each run SHALL publish the source count, stored count, addition count, retained
stored-only count, configured bounds, and whether completeness verification
succeeded.

#### Scenario: No additions are found
- **WHEN** a complete source enumeration matches the stored ID set
- **THEN** the run records a verified no-op rather than treating zero writes as
  missing evidence

#### Scenario: Additions are inserted
- **WHEN** complete source evidence produces source-only IDs within the bound
- **THEN** the run reports how many repositories were planned and actually
  inserted

