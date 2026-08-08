# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers evaluating open-source projects and tools for software they are
already building. They use GitHub as the source of project identity and want a
faster way to find relevant, credible additions to a project's stack.

## Product Purpose

Starboard is project-aware tool intelligence. It connects a developer's GitHub
projects to a catalog of open-source repositories, then helps them discover
projects and tools that are relevant to the work at hand.

Success means a developer can connect a project, understand its current
technical context, and find a useful repository to evaluate without manually
trawling GitHub or maintaining a separate internal project catalog.

## Positioning

Starboard combines project context, repository metadata, semantic discovery,
and evidence-backed tool detection. Recommendations start from the user's own
GitHub project rather than a generic trending list or a Fleet-specific registry.

## Operating Context

- GitHub is the identity and project source.
- The public Discover corpus and Tool Intelligence surfaces remain useful
  without a connected project.
- A signed-in user can organize starred repositories and connect projects for
  project-aware discovery.
- The initial project-connection boundary is public GitHub repositories using
  the existing minimal OAuth permission. Private-repository access is an open
  product and permission decision.

## Capabilities and Constraints

- Public repository discovery with search, language, tool, and growth filters.
- Evidence-aware tool detection from manifests, SBOMs, repository trees, and
  lower-confidence metadata inference.
- Personal starred-repository library with lists, saved state, notes, and sync.
- Connected GitHub projects and project-aware repository recommendations.
- Similar repositories are the grounding set for tool recommendations; every
  recommended tool names the peer repositories that supplied its evidence.
- The product is free. Project connection, similar-project discovery, grounded
  tool recommendations, Discover, and the personal Library have no paid gate.
- No Fleet-specific project catalog or Fleet project metadata in the product.
- Alerts, reports, Stack Builder, Radar, and weekly digest are not part of the
  focused product.
- No new production dependencies or broader GitHub OAuth scope are required for
  the initial connected-project workflow.

## Brand Commitments

The product name is Starboard. Product language should be direct, technical,
and evidence-aware; avoid overstating recommendation quality or tool-detection
certainty.

## Evidence on Hand

- Repository metadata and star snapshots stored in D1.
- A seeded public repository corpus.
- Tool detections with confidence and source metadata.
- Existing GitHub OAuth and starred-repository sync.
- Existing Discover, Tool Intelligence, repository-detail, and Library
  surfaces.

No customer testimonials or proven recommendation-quality benchmark is
currently documented; future product copy must not fabricate them.

## Product Principles

1. Start from the developer's project, not an operator-owned catalog.
2. Prefer evidence and explainability over generic popularity rankings.
3. Keep discovery useful before sign-in and more relevant after connection.
4. Ask for the least GitHub access necessary.
5. Remove secondary surfaces that distract from project-aware discovery.
6. Keep repository intelligence free and trace every recommendation to source
   evidence.
