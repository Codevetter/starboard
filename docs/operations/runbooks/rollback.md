# Runbook: Rollback a bad deploy

Cloudflare Workers keeps recent deployment versions. Use Wrangler to list and
roll back.

## List recent deployments

```bash
wrangler deployments list
```

Each row shows a deployment id, creation time, and author.

## Roll back to a previous version

```bash
wrangler rollback                  # rolls back to the previous deployment
wrangler rollback --message <id>   # roll back to a specific deployment id
```

The custom domain `starboard.codevetter.com` follows the active deployment
within seconds.

## When to roll back

- A production deploy shipped a regression (500s, broken auth, broken search).
- A scheduled job altered data in a way that broke the app.

Rollback restores the *code*; it does not undo database writes. If a migration
ran, see [migrate-schema.md](migrate-schema.md) for the additive-change policy —
additive changes are safe to leave in place.

## After rollback

- Open an issue capturing the regression and the commit that caused it.
- Fix forward on a branch, verify with `pnpm test` + `pnpm build:cf`, then
  re-deploy.
- If the regression was caused by an embedding dimension change, see
  [embedding-dimension-drift.md](embedding-dimension-drift.md).
