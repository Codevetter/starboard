# Runbook: Migrate D1 schema

Schema changes are ordered SQL files in `migrations/`. Never edit an already
applied migration; add the next numbered file and keep statements compatible
with Cloudflare D1.

## Local verification

```bash
pnpm db:migrate
pnpm exec wrangler d1 execute starboard --local --command "PRAGMA foreign_key_check"
```

`pnpm db:migrate` targets Wrangler's isolated local D1 state. For a new table or
index, add a numbered migration, run the local command, then run the smallest
affected tests and `pnpm build:cf`.

## Remote apply

```bash
pnpm db:migrate:remote
```

The remote command first rejects the placeholder database UUID. It requires
explicit approval because it mutates the configured remote D1 database. GitHub
operator workflows use this same command before their bounded job.
The manual production deploy workflow also applies pending migrations before
the build and deploy steps, so schema failure blocks the application rollout.

## Cutover safety

- Set `WRITE_FREEZE` to the exact string `true` only for an approved cutover
  window; non-safe `/api/*` methods return `503` with `Retry-After`.
- Convert the source dump with `pnpm db:convert-turso-dump`. Relational output
  is explicit-column, restartable SQL split below D1 statement/file limits;
  oversized repository descriptions are appended in bounded chunks. Validate
  vectors directly from the same SQL dump with `pnpm db:convert-turso-vectors`;
  Vectorize output rotates at 5,000 records per file.
- Before preloading, record `node scripts/snapshot-turso-logical.mjs starboard`.
  During the write freeze, rerun it and require the row-free SHA-256 digest and
  per-table counts to match. If they differ, restore Turso writes and stop; do
  not switch an unreconciled preload into production.
- Compare counts, ownership aggregates, FTS queries, embedding-hash coverage,
  digest reads, auth/session behavior, and `PRAGMA foreign_key_check` before
  deploying the D1-bound Worker.
- Keep Turso rollback-held after cutover. Retirement is a separate approval.

See [ADR-0009](../../architecture/decisions/0009-cloudflare-d1-vectorize.md).
