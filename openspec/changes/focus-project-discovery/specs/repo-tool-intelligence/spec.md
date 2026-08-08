## ADDED Requirements

### Requirement: Connected project tool context

The system SHALL use available detected-tool records for a connected project as
recommendation context while preserving confidence and evidence limitations.

#### Scenario: Project has detected tools

- **WHEN** a connected project has normalized tool records
- **THEN** project recommendations may use matching tool categories or tools and
  state those matches in their explanations

#### Scenario: Project has no detected tools

- **WHEN** a connected project has not been enriched or has no reliable tool
  records
- **THEN** project recommendations continue with other repository evidence and
  do not claim a tool match

### Requirement: Similar repositories ground tool recommendations

The system SHALL rank similar repositories before recommending tools and SHALL
derive each recommended tool only from normalized detections on those ranked
peer repositories.

#### Scenario: Peer repositories contain additional tools

- **WHEN** grounded similar repositories contain detected tools not already
  detected in the connected project
- **THEN** Starboard recommends those tools with the exact peer repositories
  and detection confidence that support the recommendation

#### Scenario: Tool is already used by the connected project

- **WHEN** a peer repository contains a tool already detected in the connected
  project
- **THEN** Starboard omits that tool from the additions it recommends

#### Scenario: Only broad fallback repositories are available

- **WHEN** no project-specific similarity signal exists
- **THEN** Starboard may show broad repository discovery but SHALL NOT present
  tools from those repositories as grounded recommendations
