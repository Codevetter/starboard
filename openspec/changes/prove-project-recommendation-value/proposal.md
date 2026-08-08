## Why

Starboard's focused product loop is now coherent, but its first-value path and
recommendation retrieval still undercut the promise: guests cannot test a
project before signing in, signed-in users must paste repository URLs, and
connected-project matches are reranked from only the 500 most-starred catalog
entries. The next pass should prove the core value before asking for commitment
and make the grounding set representative of the full eligible catalog.

## What Changes

- Add a public, read-only project preview that accepts a public GitHub URL or
  `owner/repository`, resolves visible metadata, and returns a bounded sample of
  explained similar projects before sign-in without persisting a user project.
- Replace the fixed top-500 popularity pool with bounded hybrid retrieval across
  the eligible catalog: Vectorize and full-text candidates when available,
  deterministic evidence reranking, and an honest broad fallback.
- Let authenticated users choose from public repositories available through
  their existing GitHub token or continue pasting a repository URL; do not add
  OAuth scope.
- Make the landing and Projects activation flow project-first and remove the
  remaining star-library, Hot/Watch/Stale, and digest-era framing.
- Add privacy-safe product events and lightweight useful/not-useful controls for
  recommendation-set views, repository inspections, tool inspections, and
  recommendation sentiment. No repository identity or query text is emitted.
- Clarify tool cards with support strength, source confidence, and a direct path
  to the existing Tool Intelligence detail surface.
- Update active product/status documentation and add a deterministic retrieval
  evaluation fixture for the core recommendation path.

## Capabilities

### New Capabilities

- `public-project-preview`: Read-only project-context preview before sign-in,
  including bounded GitHub resolution and non-persistent recommendation output.

### Modified Capabilities

- `github-project-connections`: Add an authenticated public-repository picker
  and privacy-safe measurement to the existing URL-based connection flow.
- `public-discovery`: Make project preview the primary public landing handoff
  while preserving direct catalog browsing.
- `repo-tool-intelligence`: Retrieve grounded peers from the eligible catalog,
  expose retrieval limitations, and collect privacy-safe recommendation
  usefulness signals.

## Impact

- Affects the project recommendation service and API, GitHub project helpers,
  Projects workspace, landing page, analytics module, focused tests, and active
  product/architecture/status documentation.
- Reuses the existing D1 full-text indexes, Cloudflare Vectorize binding,
  Workers AI embedding adapter, GitHub OAuth token, and UI components.
- Adds no production dependency, billing/entitlement gate, private-repository
  scope, raw-SQL proxy, deployment, or production configuration change.
