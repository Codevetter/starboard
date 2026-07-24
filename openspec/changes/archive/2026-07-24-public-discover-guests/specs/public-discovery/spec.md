## ADDED Requirements

### Requirement: Public Discover browsing

Starboard SHALL allow unauthenticated visitors to browse, search, sort, filter,
paginate, and open repository details from the shared seeded Discover corpus.

#### Scenario: Guest opens Discover

- **WHEN** an unauthenticated visitor opens `/discover`
- **THEN** Starboard renders public repository results without redirecting to
  sign-in

#### Scenario: Guest filters the public corpus

- **WHEN** a guest searches or applies a public language or tool filter
- **THEN** the Discover API returns matching public results without requiring a
  session

#### Scenario: Guest opens repository details

- **WHEN** a guest selects a repository from Discover
- **THEN** Starboard opens its public repository detail surface

### Requirement: Authentication adds personalization

Starboard MUST keep saved state, collections, list filtering, and write controls
authenticated while preserving the same public Discover corpus for guests.

#### Scenario: Guest sees public controls only

- **WHEN** Discover renders without an authenticated session
- **THEN** collection, save, and list-assignment controls are absent and no
  private list request is sent

#### Scenario: Guest requests a private list filter

- **WHEN** an unauthenticated request supplies `list_id` to the Discover API
- **THEN** the API rejects that private filter without querying personalized
  repository state

#### Scenario: Authenticated visitor uses personalization

- **WHEN** an authenticated visitor opens Discover
- **THEN** saved state, collections, and authenticated mutations remain
  available

### Requirement: Public landing handoff

The Starboard landing page SHALL link guests directly to the working public
Discover surface as the alternative to connecting GitHub.

#### Scenario: Guest follows the public CTA

- **WHEN** a visitor selects the landing-page public browsing CTA
- **THEN** the visitor reaches `/discover` and can use the shared corpus
