## Purpose

Let signed-in developers use public GitHub repositories they control or work on
as durable project context for discovering relevant open-source tools.

## ADDED Requirements

### Requirement: Connect a public GitHub project

Starboard SHALL allow an authenticated user to connect a public GitHub
repository by its GitHub URL or `owner/repository` name without requesting a
broader OAuth scope.

#### Scenario: Valid public repository

- **WHEN** an authenticated user submits a valid public GitHub repository
- **THEN** Starboard resolves the repository, stores it as that user's connected
  project, and returns the connected project

#### Scenario: Repository is already connected

- **WHEN** a user submits a public repository they already connected
- **THEN** Starboard returns the existing connection without creating a
  duplicate

#### Scenario: Repository cannot be resolved publicly

- **WHEN** the submitted repository is missing, private, or inaccessible with
  the current permission
- **THEN** Starboard rejects the connection with a recovery message that states
  only public repositories are supported

### Requirement: User-owned project connections

Starboard MUST isolate project connections by authenticated user.

#### Scenario: List connected projects

- **WHEN** an authenticated user opens Projects
- **THEN** Starboard returns only that user's connected projects

#### Scenario: Disconnect a project

- **WHEN** an authenticated user disconnects one of their projects
- **THEN** Starboard removes only that user's connection and retains the shared
  repository catalog record

#### Scenario: Guest accesses Projects

- **WHEN** an unauthenticated visitor requests a project connection or project
  recommendations
- **THEN** Starboard requires GitHub sign-in and exposes no user project data

### Requirement: Project-aware recommendations

Starboard SHALL recommend public repositories for a connected project using
available project metadata and tool evidence, and SHALL explain the evidence
that contributed to each result.

#### Scenario: Recommendations have evidence

- **WHEN** a connected project has language, topic, description, or detected
  tool context
- **THEN** each recommendation identifies the matching signals and links to the
  repository detail surface

#### Scenario: Sparse project context

- **WHEN** a connected project has little or no enriched context
- **THEN** Starboard labels the result as a broad discovery fallback instead of
  implying a precise project match

#### Scenario: Project is not owned by the requester

- **WHEN** a user requests recommendations for another user's connected project
- **THEN** Starboard responds as though the connection does not exist

### Requirement: Free connected-project workflow

Starboard SHALL provide project connection, similar-project discovery, and
grounded tool recommendations without billing, subscription, or paid-feature
entitlement checks.

#### Scenario: Signed-in user uses project intelligence

- **WHEN** an authenticated user connects a supported public repository
- **THEN** the complete project-intelligence workflow is available without a
  checkout, plan selection, usage credit, or premium lock
