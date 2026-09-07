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
- `STARBOARD_OPERATOR_TOKEN` (dedicated bearer credential for internal operator routes)

## GitHub Actions secrets (repo secrets)

- `CLOUDFLARE_API_TOKEN` (deploy plus scoped D1 access)
- `STARBOARD_OPERATOR_TOKEN` (must match the Worker operator credential)
- `AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY` (HTTP AI enrichment only; not operator-route authorization)

GitHub Actions repository variables (non-secret) include
`CLOUDFLARE_ACCOUNT_ID` and `D1_DATABASE_ID`.

The `seed-popular` workflow deliberately uses `${{ github.token }}` for GitHub
Search (not a long-lived PAT) so a stale PAT cannot break a scheduled or manual
seed run with 401 Bad credentials.

The scheduled reconciliation sets `MIN_STARS_FLOOR=5000`,
`SEED_MIN_SOURCE_REPOS=5000`, and `SEED_MAX_ADDITIONS=100`. The last value is a
pre-write Cloudflare budget circuit breaker and is exposed as an explicit
manual-dispatch input that can lower the bound. Values above the code-level hard
limit of 100 are rejected before GitHub or D1 access.

## Operator credential recovery gate

The embedding, project-intelligence and external-review operator routes require
`STARBOARD_OPERATOR_TOKEN`. The AI gateway credential must not be substituted
for it. The three embedding/probe workflows validate that the dedicated token is
present before remote migrations, seeding or binding checks; the Worker still
verifies its actual value.

On 2026-09-07, repository secret-name metadata did not include
`STARBOARD_OPERATOR_TOKEN`. No secret value or Worker secret state was read.
An authorized operator must separately provision or verify a dedicated matching
value in the Worker and GitHub Actions, then approve a bounded recovery run.
Provisioning and production verification remain open in
[#107](https://github.com/Codevetter/starboard/issues/107); a source change and
passing CI do not recover the scheduled job.

## Public keys

`NEXT_PUBLIC_SAASMAKER_API_KEY` is a public key (expected to be visible in
client bundles) — not a secret.
