## ADDED Requirements

### Requirement: Tool Intelligence explains its evidence model

Tool Intelligence SHALL visibly explain how repository sources, confidence, counts, and catalog scopes affect the results without styling normal methodology as a warning.

#### Scenario: Visitor opens Tool Intelligence

- **WHEN** the Tool Intelligence index or a tool detail renders successfully
- **THEN** the page shows a neutral how-it-works explanation and identifies the currently selected repository scope

#### Scenario: Visitor compares scopes

- **WHEN** a visitor views Popular tools, My library, or Combined
- **THEN** the interface states that Popular tools uses public repositories above the displayed star floor, My library uses the visitor's starred repositories, and Combined is the union of both without double-counting repositories

#### Scenario: Signed-out visitor sees personal scopes

- **WHEN** a signed-out visitor views My library or Combined controls
- **THEN** those controls remain unavailable and their explanation identifies that sign-in is required
