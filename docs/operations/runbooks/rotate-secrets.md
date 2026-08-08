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
must re-authenticate.

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

## After rotation

- Smoke: `curl --fail https://starboard.codevetter.com/` and sign in once.
- Trigger `seed-popular` manually to confirm scoped D1, Vectorize, and AI
  gateway access.
