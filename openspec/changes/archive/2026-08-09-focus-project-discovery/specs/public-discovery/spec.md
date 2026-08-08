## ADDED Requirements

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

