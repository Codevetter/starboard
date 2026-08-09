## ADDED Requirements

### Requirement: Choose a public repository from GitHub

Starboard SHALL let an authenticated user load and select public repositories
available through the existing GitHub token while retaining manual URL entry.

#### Scenario: User opens the repository picker

- **WHEN** a signed-in user asks to choose from GitHub
- **THEN** Starboard fetches a bounded list of public repositories using the
  existing OAuth token and does not request a broader scope

#### Scenario: Picker is unavailable

- **WHEN** GitHub cannot return the repository list
- **THEN** Starboard keeps manual public URL entry usable and shows a recovery
  message for the picker

### Requirement: Privacy-safe project activation measurement

Starboard SHALL measure the project-connection and recommendation activation
funnel without emitting repository names, repository identifiers, query text,
or GitHub access tokens.

#### Scenario: Project is connected

- **WHEN** a signed-in user successfully connects a project
- **THEN** Starboard records the connection source as picker or manual entry
  without recording repository identity
