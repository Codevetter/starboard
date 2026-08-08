## Why

Starboard currently spreads its strongest discovery and tool-intelligence
capabilities across several weak or misleading secondary products. The product
should instead help developers connect their own GitHub projects and discover
relevant open-source repositories without relying on Fleet-specific metadata.

## What Changes

- Add a signed-in workflow for connecting public GitHub repositories as the
  user's projects using the existing minimal OAuth permission.
- Replace the checked-in Fleet project catalog and Fleet recommendation routes
  with persisted, user-owned project connections and project-aware discovery.
- Explain project recommendations with repository, language, topic, and
  detected-tool evidence; never present a generic popularity match as a
  project-specific fact.
- Make similar repositories the grounding layer for tool recommendations, and
  show the exact peer repositories that support every recommended tool.
- Keep the focused product free: connecting repositories, similar-project
  discovery, and grounded tool recommendations SHALL NOT require payment.
- Refocus navigation and product copy on Discover, Projects, Tool Intelligence,
  and the personal Library.
- **BREAKING** Remove Alerts, Reports, Stack Builder, Radar, and weekly digest
  pages, APIs, components, operator scripts, and active documentation.
- Preserve star snapshots and the Discover growth sort; only the standalone
  Radar presentation is removed.
- Keep private GitHub repositories and broader OAuth scopes out of the initial
  release.

## Capabilities

### New Capabilities

- `github-project-connections`: Connect, list, disconnect, and use public GitHub
  repositories as project context for recommendations.

### Modified Capabilities

- `public-discovery`: Allow connected-project context to lead users into
  evidence-backed repository discovery while keeping the public corpus useful
  to guests.
- `repo-tool-intelligence`: Use detected tools as project context and
  recommendation evidence.
- `star-momentum-insights`: Remove the standalone Radar presentation while
  retaining stored history and the Discover growth sort.

## Impact

- Replaces `/projects`, `/api/projects`, and Fleet recommendation code with a
  user-owned D1 model and public GitHub repository resolution.
- Removes the `/radar`, `/stack-builder`, `/reports/*`, alert, and digest route
  families plus their dead support code and scheduled workflow.
- Adds one additive D1 migration for connected projects; no remote migration or
  deployment is performed by this change.
- Updates navigation, landing/product documentation, runtime indexing surfaces,
  tests, and package scripts.
- Adds no production dependency and does not change GitHub OAuth scopes.
- Adds no billing, subscription, checkout, or paid entitlement surface.
