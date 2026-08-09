# ADR-0001 — Deployment: Vercel → Cloudflare Workers via OpenNext

**Date:** 2026-04-25 (Workers); 2026-04-25 (Pages brief detour); 2026-04-28 (back to Workers)
**Status:** Active

## Context

Starboard was initially deployed on Vercel. A batch DB write timeout in the sync
route (`fix: batch all DB writes in sync to avoid Vercel timeout`, pre-migration)
was a pain point. The CF Workers AI binding (free embeddings, zero HTTP hop) and
the desire to run everything in one provider motivated the move.

## Decision

Deploy via `@opennextjs/cloudflare` to a Cloudflare Worker named `starboard`.
The app bundles to ~1.33 MB gzip, inside the 3 MB free-tier Worker cap. A brief
one-day detour through CF Pages (`ci: migrate deploy from CF Workers to CF
Pages`, 2026-04-25) was reverted (`ci: rewrite workflow for Workers deploy`,
2026-04-28) because the Pages pattern for opennext was broken for this app.

## Rationale

CF Workers gives access to the AI binding (free embeddings), a single deployment
target for the Next.js app and embedding inference, and avoids Vercel cold-start
/ timeout behavior on long-running sync routes. `nodejs_compat` Workers flag
provides the Node API surface needed by NextAuth and libsql.

## Alternatives considered

- CF Pages (tried, reverted — deploy workflow was broken for opennext).
- Stay on Vercel + separate Workers AI HTTP calls (adds latency, extra secrets,
  no bundling wins).

## Tradeoffs

The opennext build must use `--webpack` not Turbopack. Static asset CDN is
wrangler `assets` binding. The mixed public/authenticated Next.js application
uses OpenNext's default dynamic-route behavior; the static-assets incremental
cache is not used because it is only safe for fully static sites. The separate
Astro landing overlay and immutable files keep explicit asset cache policies,
while protected application HTML is `private, no-store`.

## See also

- [0003-opennext-libsql-bundling.md](0003-opennext-libsql-bundling.md)
- [../../knowledge/failed-approaches.md](../../knowledge/failed-approaches.md)
  (CF Pages detour)
- [../../archive/retro-2026-04-25-vercel-to-cloudflare.md](../../archive/retro-2026-04-25-vercel-to-cloudflare.md)
