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

## Cutover safety

- Set `WRITE_FREEZE` to the exact string `true` only for an approved cutover
  window; non-safe `/api/*` methods return `503` with `Retry-After`.
- Convert the source dump with `pnpm db:convert-turso-dump` and validate vectors
  with `pnpm db:convert-turso-vectors`; vector output rotates at 5,000 records
  per file for the Vectorize HTTP upsert limit.
- Compare counts, ownership aggregates, FTS queries, embedding-hash coverage,
  digest reads, auth/session behavior, and `PRAGMA foreign_key_check` before
  deploying the D1-bound Worker.
- Keep Turso rollback-held after cutover. Retirement is a separate approval.

See [ADR-0009](../../architecture/decisions/0009-cloudflare-d1-vectorize.md).
