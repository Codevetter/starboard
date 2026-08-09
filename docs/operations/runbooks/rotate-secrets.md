# Runbook: Rotate secrets

Rotate Cloudflare and GitHub OAuth secrets. Never commit secrets
to the repo — all secrets are gitignored or stored as Cloudflare/GitHub
Actions secrets.

## Cloudflare Worker secrets

List current secrets:

```bash
wrangler secret list
```

Rotate one:

```bash
wrangler secret put AUTH_SECRET
wrangler secret put AUTH_GITHUB_SECRET
wrangler secret put RAG_SERVICE_KEY
```

After rotating `AUTH_SECRET`, existing NextAuth sessions are invalidated — users
must re-authenticate. This does not revoke an upstream GitHub OAuth access
token.

## Cloudflare operator token

Create a scoped replacement token with only the D1/Vectorize/deploy permissions
required by the workflows, replace the GitHub Actions
`CLOUDFLARE_API_TOKEN` secret, run one bounded manual job, then revoke the old
token from the Cloudflare dashboard.

Do not remove or invalidate Turso credentials while that database is
rollback-held. Retirement and secret removal require separate approval.

## GitHub OAuth app

GitHub Developer Settings → OAuth Apps → Starboard → generate a new client
secret. Update:

- `wrangler secret put AUTH_GITHUB_SECRET`
- GitHub Actions repo secret `AUTH_GITHUB_SECRET` (only if a workflow uses it —
  the deploy workflow does not).

## Cached authenticated HTML incident

If protected HTML was served from a shared cache:

1. Deploy the cache-boundary fix before restoring ordinary traffic.
2. Purge the affected Cloudflare cache entries (or the zone cache when the
   affected keys cannot be enumerated safely).
3. Revoke the affected user's Starboard GitHub OAuth authorization/access token
   in GitHub, then have the user sign in again.
4. Verify `/projects` is `private, no-store`, is not a Cloudflare cache hit, and
   contains no serialized access token or session credential.

Treat any token present in cached HTML as compromised even if it may have
expired. Never paste a token into logs, issues, commands, or chat. Rotating
`AUTH_SECRET` alone is insufficient because it cannot revoke GitHub's token.

## After rotation

- Smoke: `curl --fail https://starboard.codevetter.com/` and sign in once.
- Trigger `seed-popular` manually to confirm scoped D1, Vectorize, and AI
  gateway access.
