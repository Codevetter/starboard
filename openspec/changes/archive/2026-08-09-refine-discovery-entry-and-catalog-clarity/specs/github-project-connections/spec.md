## MODIFIED Requirements

### Requirement: Choose a public repository from GitHub

Starboard SHALL let an authenticated user load and select every public repository available through the existing GitHub token while retaining manual URL entry.

#### Scenario: User opens the repository picker

- **WHEN** a signed-in user asks to choose from GitHub
- **THEN** Starboard follows GitHub pagination until every available public repository has been loaded without requesting a broader scope

#### Scenario: Picker is unavailable

- **WHEN** GitHub cannot return the complete repository list
- **THEN** Starboard keeps manual public URL entry usable and shows a recovery message for the picker
