## ADDED Requirements

### Requirement: Discover is the default authenticated entry

Starboard SHALL send a successful generic sign-in to Discover while preserving a valid explicit internal return destination.

#### Scenario: Generic sign-in succeeds

- **WHEN** a visitor signs in without an explicit internal callback URL
- **THEN** Starboard opens `/discover`

#### Scenario: Protected flow supplies a return destination

- **WHEN** a visitor signs in from Library, Projects, or a project preview with a valid internal callback URL
- **THEN** Starboard returns the visitor to that destination

### Requirement: Discover results remain readable with real repository content

Starboard SHALL size and truncate repository result cards so long names, descriptions, and topics do not overlap controls or escape their card at supported viewport widths.

#### Scenario: Repository metadata is unusually long

- **WHEN** a Discover result contains a long owner, repository name, description, or topic
- **THEN** the card keeps its actions accessible and truncates the overflowing content within a stable grid row

### Requirement: Landing explains the first-value path

The public landing page SHALL make the project-to-peer-to-tool flow understandable before sign-in and keep public Discover browsing visibly available.

#### Scenario: Visitor evaluates Starboard from the landing page

- **WHEN** a visitor reads the first landing viewport and its immediate proof section
- **THEN** the visitor can identify how a public project becomes grounded repository and tool evidence and can either preview a project or open Discover
