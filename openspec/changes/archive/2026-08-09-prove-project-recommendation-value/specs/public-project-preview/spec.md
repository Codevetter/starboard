## Purpose

Let a visitor test Starboard's project-aware discovery with public repository
context before creating an account or persisting a project connection.

## ADDED Requirements

### Requirement: Preview a public GitHub project before sign-in

Starboard SHALL accept a public GitHub URL or `owner/repository` from an
unauthenticated visitor and return a bounded, read-only project-intelligence
preview without creating user-owned data.

#### Scenario: Cataloged public repository

- **WHEN** a guest previews a public repository already present in the catalog
- **THEN** Starboard uses the cataloged metadata and evidence to show explained
  similar projects without requiring sign-in

#### Scenario: Uncataloged public repository

- **WHEN** a guest previews a valid public repository not yet in the catalog
- **THEN** Starboard asks for the existing minimal GitHub sign-in, preserves the
  repository value, and performs no anonymous GitHub API lookup

#### Scenario: Signed-in uncataloged public repository

- **WHEN** a signed-in user previews a public repository not yet in the catalog
- **THEN** Starboard resolves it with the user's existing GitHub token and shows
  the best available explained preview without persisting a project connection

#### Scenario: Invalid or unavailable repository

- **WHEN** the supplied value is invalid, private, missing, or unavailable
- **THEN** Starboard returns a recovery message that states the accepted public
  repository format and does not imply private-repository access

### Requirement: Preview preserves an honest connection boundary

Starboard MUST distinguish transient preview context from a durable connected
project and SHALL require GitHub sign-in before saving the project.

#### Scenario: Guest wants to keep the previewed project

- **WHEN** a guest selects the connect action from a successful preview
- **THEN** Starboard sends the guest through GitHub sign-in and returns them to
  Projects with the public repository value ready to connect

#### Scenario: Guest only inspects the preview

- **WHEN** a guest views recommendations and leaves without signing in
- **THEN** Starboard creates no user project, list, note, or saved-repository row

### Requirement: Preview work is bounded and degradable

Starboard SHALL bound external resolution and recommendation work so a preview
cannot trigger bulk GitHub or unbounded catalog operations.

#### Scenario: Recommendation infrastructure is partially unavailable

- **WHEN** semantic retrieval or GitHub resolution is temporarily unavailable
- **THEN** Starboard either uses available catalog evidence or returns a clear
  retry state without fabricating recommendations
