# Product Overview

## What

Starboard is project-aware tool intelligence for GitHub. It connects a
developer's public GitHub projects to a seeded open-source repository catalog,
then explains which repositories and tools may fit the work being built.
Similar repositories form the grounding layer: tool recommendations come only
from normalized detections on those peers and name their repository sources.

The product also keeps a personal starred-repository library with search,
lists, tags, saved state, and notes. Discover and Tool Intelligence remain
publicly useful without sign-in.

## Who

- **Developers:** people evaluating open-source tools for active software
  projects or rediscovering useful repositories from a large GitHub star list.
- **Operators:** the maintainer running D1 migrations, bounded catalog jobs, and
  Cloudflare Workers deploys.

GitHub OAuth uses the minimal `read:user` scope. The initial connected-project
workflow supports public repositories only; private-project access is a
separate permission decision.

Starboard is free. It has no checkout, subscription, credit, or premium-feature
gate for project connections, similar repositories, tool recommendations,
Discover, or the personal Library.

## Where

- Production app: <https://starboard.codevetter.com>.
- Source: this repository.
- Landing page: `landing-astro/`, overlaid into the OpenNext assets during
  `pnpm build:cf`.

See [surfaces.md](surfaces.md) for the route and API map.

## Scope

**In scope:** public repository discovery; evidence-aware tool intelligence;
public GitHub project connections; project-aware repository recommendations;
starred-repository sync, organization, search, and public lists; repository
details and stored star history.

**Out of scope:**

- Private GitHub repositories until the permission model is deliberately
  chosen.
- Organization/team dashboards and multi-user workspaces.
- Non-GitHub providers.
- Automated dependency installation or code modification.
- Alerts, email digests, reports, Stack Builder, and standalone Radar.

## Operating posture

Active product under development. See [STATUS.md](../../STATUS.md) for the
current objective and [features.md](features.md) for the implemented inventory.
