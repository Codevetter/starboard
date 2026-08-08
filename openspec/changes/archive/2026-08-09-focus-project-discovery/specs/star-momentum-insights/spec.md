## MODIFIED Requirements

### Requirement: Momentum surfaces

The system SHALL display star momentum in Discover and repository detail
surfaces without blocking page loads on external network calls.

#### Scenario: Discover growth sort

- **WHEN** a user sorts Discover by growth
- **THEN** the results use stored snapshot growth metrics and remain paginated

#### Scenario: Repository detail history

- **WHEN** a repository has stored star history
- **THEN** its repository detail surface may show that history without making a
  synchronous GitHub request

