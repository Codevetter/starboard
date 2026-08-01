# Environment variables

Source of truth: `.env.example` (values redacted) and `wrangler.jsonc` `vars`.
This page annotates intent and where each var is read.

## Local dev (`.env.local`)

Copied from `.env.example`. **Never commit `.env.local`** — it is gitignored.

| Variable | Purpose |
| --- | --- |
| `GITHUB_ID`, `GITHUB_SECRET` | GitHub OAuth app credentials (NextAuth) |
| `NEXTAUTH_SECRET` | NextAuth session secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App base URL, e.g. `http://localhost:3000` |
| `AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY` | HTTP embedding path (Node/Actions); optional in the Worker which uses the `AI` binding |
| `RESEND_API_KEY` | Weekly digest email (fail-closed: delivery skipped with a log when unset) |
| `DIGEST_EMAIL_FROM` | Optional verified Resend sender, e.g. `Starboard <digest@example.com>` |
| `RAG_SERVICE_KEY` | Shared `knowledgebase` Worker RAG auth (optional; without it relevance search is lexical-only) |
| `STARBOARD_RAG_INDEX_ID` | RAG index id (also set as a wrangler var) |

## Worker vars (`wrangler.jsonc` `vars` — non-secret)

- `NEXT_PUBLIC_APP_NAME` = `starboard`
- `AUTH_URL` = `https://starboard.codevetter.com`
- `NEXTAUTH_URL` = `https://starboard.codevetter.com`
- `WRITE_FREEZE` = exact string `false` outside an approved cutover window
- `STARBOARD_RAG_INDEX_ID` = the RAG index id

Both `AUTH_URL` and `NEXTAUTH_URL` must be set — NextAuth v5 reads `AUTH_URL`
for the callback base URL and some internal paths read the legacy
`NEXTAUTH_URL`. See [../knowledge/learnings.md](../knowledge/learnings.md).

## Worker secrets (`wrangler secret put`)

- `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
- `RAG_SERVICE_KEY` (optional)
- `AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY` (only if keeping the HTTP path)

## GitHub Actions secrets (repo secrets)

- `CLOUDFLARE_API_TOKEN` (deploy plus scoped D1/Vectorize access)
- `AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY` (seed/enrich/embed jobs)
- `RESEND_API_KEY` (weekly digest email; optional — fail-closed)

GitHub Actions repository variables (non-secret) include
`CLOUDFLARE_ACCOUNT_ID` and `D1_DATABASE_ID`.

The `seed-popular` workflow deliberately uses `${{ github.token }}` for GitHub
Search (not a long-lived PAT) so a stale PAT cannot break a manual seed run with
401 Bad credentials.

## Public keys

`NEXT_PUBLIC_SAASMAKER_API_KEY` is a public key (expected to be visible in
client bundles) — not a secret.
