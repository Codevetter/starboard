# ADR-0003 — OpenNext + @libsql bundling workaround

**Date:** 2026-04-25
**Status:** Superseded by [ADR-0009](0009-cloudflare-d1-vectorize.md)

## Context

OpenNext 1.19 for Cloudflare did not honor Next.js `transpilePackages` for
`@libsql/client`. The package ships a `workerd` export condition pointing to a
CF-compatible build, but OpenNext externalised the package rather than bundling
it, causing a runtime module-not-found in workerd. Several approaches failed
before a stable path was found.

## Decision

1. `src/db/index.ts` imports from `@libsql/client/web` (the subpath that skips
   native Node bindings) so webpack picks the correct entry.
2. `next.config.ts` adds `transpilePackages: ["@libsql/client"]` to force the
   package into the bundle.
3. The CF build script uses `--webpack` (not Turbopack) because
   opennext-cloudflare 1.19 does not fully bundle externalized packages with
   Turbopack output.
4. `db/index.ts` uses a lazy-init proxy so the client is not constructed at
   module load time (fixes CI build failures where env vars are absent).

## Rationale

Each mitigation addressed a specific failure mode documented in the git log and
agents.md memory context. `@libsql/client/web` is the correct import for non-Node
runtimes; the `transpilePackages` entry ensures webpack processes it rather than
treating it as an external.

## Alternatives considered

- `useWorkerdCondition: true` in OpenNext config (tried, had no effect).
- Webpack externals override (tried, caused native sqlite3 import failures).
- Full switch to Cloudflare D1 (evaluated, rejected — Turso is already
  provisioned, D1 has different limits, and migration is a large blast radius).

## Tradeoffs

Forces the webpack build path for the CF bundle, losing potential Turbopack
incremental-build speed. Must keep `@libsql/client/web` import; using the
default `@libsql/client` entry will re-break the Worker.

## See also

- [0001-deploy-vercel-to-cloudflare-workers.md](0001-deploy-vercel-to-cloudflare-workers.md)
- [../../knowledge/learnings.md](../../knowledge/learnings.md) — `@libsql/client`
  bundling lessons.
