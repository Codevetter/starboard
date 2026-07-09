## ADDED Requirements

### Requirement: Per-repo star history
The system SHALL expose historical star count samples for a repository when Starboard has captured at least one `repo_star_snapshots` row for that repository.

#### Scenario: Repository has snapshot history
- **WHEN** a user opens a repository detail or momentum API for a repository with captured snapshots
- **THEN** the system returns ordered star history points containing capture time and star count

#### Scenario: Repository has no usable history
- **WHEN** a repository has fewer than two captured snapshots in the selected window
- **THEN** the system returns an empty or collecting-history state instead of fabricating growth

### Requirement: Fastest-growing repository rankings
The system SHALL rank repositories by star growth over a selected window using captured snapshots.

#### Scenario: Ranking by absolute growth
- **WHEN** two or more repositories have at least two snapshots in the selected window
- **THEN** the system orders them by stars gained, then current stars as a tie-breaker

#### Scenario: Ranking by growth rate
- **WHEN** the user selects a growth-rate ranking
- **THEN** the system uses percent growth or per-day growth only when the first sample is greater than zero and enough history exists

### Requirement: Momentum surfaces
The system SHALL display star momentum in existing Starboard surfaces without blocking page loads on external network calls.

#### Scenario: Radar momentum summary
- **WHEN** the Radar page loads
- **THEN** it shows fastest-growing repositories and 30-day growth signals from stored snapshots

#### Scenario: Discover growth sort
- **WHEN** a user sorts Discover by growth
- **THEN** the results use stored snapshot growth metrics and remain paginated

### Requirement: 5k corpus support
The system SHALL support a seeded corpus of at least 5,000 repositories without synchronous snapshot or GitHub fetch work during UI requests.

#### Scenario: Corpus is expanded
- **WHEN** the scheduled seed job processes thousands of eligible repositories
- **THEN** it records star snapshots in bounded batches and UI reads use indexed database queries
