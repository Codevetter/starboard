## MODIFIED Requirements

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

## ADDED Requirements

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
