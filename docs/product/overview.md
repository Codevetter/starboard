# Product Overview

## What

Starboard turns a large GitHub star list into a searchable personal knowledge
base. It syncs stars, enriches repository metadata, lets the user organize repos
with tags and collections, maps saved repositories to active fleet projects, and
uses embeddings to make semantic discovery possible across both personal stars
and a seeded pool of popular repositories.

## Who

- **End users:** developers with many GitHub stars who want to rediscover and
  organize them. Sign-in is GitHub OAuth (NextAuth v5, `read:user` scope); data
  is per-user isolated at the database level.
- **Operators:** the maintainer running D1 migrations and Cloudflare Workers
  deploys. Currently single-operator in production.

## Where

- Production app: <https://starboard.codevetter.com> (Cloudflare Worker
  `starboard`, custom domain). See [surfaces.md](surfaces.md) for the full route
  and API map.
- Source: this repository.
- Landing page: built from `landing-astro/` and overlaid into the OpenNext
  assets during `pnpm build:cf`.

## Scope

**In scope:** starred-repo dashboard with tags, collections, filters, and
semantic search; fleet-aware My Projects recommendations; discovery and repo
detail pages; radar maintainer signals; weekly alert inbox and digest payloads;
shareable read-only insight reports; tool intelligence; stack builder.

**Out of scope (deliberate):**

- Organization/team dashboards and multi-user workspaces.
- Non-GitHub providers (npm, PyPI, etc.).
- ATS features and general GitHub analytics beyond starred-repo rediscovery.
- Real-time push notifications (email/in-app digest first).
- Paid weekly intelligence productization beyond preview surfaces.

## Operating posture

Active product under development. See [STATUS.md](../../STATUS.md) for the
current objective, active work, blockers, and next steps, and
[features.md](features.md) for the shipped feature inventory.
