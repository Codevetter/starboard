## MODIFIED Requirements

### Requirement: Public landing handoff

The Starboard landing page SHALL make a public project preview the primary
first-value action and SHALL preserve direct public Discover browsing as an
alternative.

#### Scenario: Guest submits a public project

- **WHEN** a visitor enters a GitHub URL or `owner/repository` on the landing
  page
- **THEN** the visitor reaches a working read-only project preview without
  first being required to sign in

#### Scenario: Guest follows the public browsing alternative

- **WHEN** a visitor selects the landing-page public browsing action
- **THEN** the visitor reaches `/discover` and can use the shared corpus
