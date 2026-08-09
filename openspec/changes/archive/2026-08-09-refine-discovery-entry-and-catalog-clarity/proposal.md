## Why

Starboard currently sends a generic sign-in to Projects, truncates repository names into adjacent controls, explains Tool Intelligence scopes only through hover text, and loads only the first 100 GitHub repositories into the project picker. These defects obscure the core discovery loop and can make a developer believe repositories are missing.

## What Changes

- Make Discover the default post-sign-in destination while preserving explicit return URLs.
- Load every public GitHub repository available through the existing token into the Projects picker, without broadening OAuth permissions.
- Make Discover repository cards compact, stable, and safely truncated at supported widths.
- Replace warning-styled Tool Intelligence notices with a visible explanation of how detections, confidence, and scope selection work.
- Clarify the exact contents of Popular tools, My library, and Combined on both Tool Intelligence surfaces.
- Refine the landing page around the public project-preview and discovery loop without replacing the established visual language.
- Prevent authenticated session data from entering publicly cacheable HTML and stop using the SSG-only static-assets incremental cache for dynamic routes.

## Capabilities

### New Capabilities

- `authenticated-session-isolation`: Authenticated HTML and session credentials remain private and uncached across users.

### Modified Capabilities

- `public-discovery`: Default authenticated entry, landing handoff clarity, and readable repository results.
- `github-project-connections`: Complete pagination of public repository choices.
- `repo-tool-intelligence`: Visible scope definitions and a useful evidence-method explanation.

## Impact

The change affects login routing, GitHub repository-list fetching, Discover card/grid presentation, the Astro landing page, Tool Intelligence list/detail pages, OpenNext cache selection, session-provider hydration, tests, and product documentation. It adds no dependency, OAuth scope, schema migration, billing gate, or secret value.
