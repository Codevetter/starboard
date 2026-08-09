# Public Discovery

## Purpose

Define the unauthenticated Starboard discovery experience and the boundary
between public repository browsing and signed-in personalization.
## Requirements
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

The Starboard landing page SHALL make a public project preview the primary
first-value action and SHALL preserve direct public Discover browsing as an
alternative.

#### Scenario: Guest submits a cataloged public project

- **WHEN** a visitor enters a cataloged GitHub URL or `owner/repository` on the
  landing page
- **THEN** the visitor reaches a working read-only project preview without
  first being required to sign in

#### Scenario: Guest submits an uncataloged public project

- **WHEN** a visitor enters a repository that is not yet in Starboard's catalog
- **THEN** Starboard preserves the repository and asks for GitHub sign-in before
  making the external lookup

#### Scenario: Guest follows the public CTA

- **WHEN** a visitor selects the landing-page public browsing action
- **THEN** the visitor reaches `/discover` and can use the shared corpus

### Requirement: Connected project discovery handoff

Starboard SHALL let an authenticated user move from a connected project to the
public repository corpus with the project context and recommendation evidence
visible.

#### Scenario: User opens a connected project

- **WHEN** an authenticated user selects one of their connected projects
- **THEN** Starboard shows project-aware repository recommendations drawn from
  the public Discover corpus

#### Scenario: User opens a recommended repository

- **WHEN** a user selects a project recommendation
- **THEN** Starboard opens the existing public repository detail surface

### Requirement: Public search is stable and meaning-aware

Discover SHALL combine bounded semantic and lexical candidates for relevance
search and SHALL NOT surface an error merely because its own filter state
changed.

#### Scenario: Visitor changes a search or filter

- **WHEN** a new first-page request replaces an older Discover request
- **THEN** Starboard cancels only the stale request and renders the newest result
  without requiring a manual retry

#### Scenario: Semantic retrieval is unavailable

- **WHEN** Workers AI or Vectorize cannot serve a Discover query
- **THEN** Starboard returns bounded lexical results and does not fail the page
