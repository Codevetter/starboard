# Deploy

Starboard deploys to Cloudflare Workers as the `starboard` Worker with a custom
domain `starboard.codevetter.com`. Production deploys are manual
`workflow_dispatch` runs; pushing to `main` does not change production.

## Pipeline

```
workflow_dispatch
  → .github/workflows/deploy.yml
      pnpm install --frozen-lockfile --ignore-scripts
      pnpm cf:build
        → next build --webpack
        → node scripts/run-inline-critical-css.mjs   (Beasties critical CSS)
        → opennextjs-cloudflare build --skipNextBuild
        → opennextjs-cloudflare populateCache local
        → pnpm --filter ./landing-astro build
        → node scripts/run-overlay-astro-landing.mjs (overlay landing → assets)
      wrangler deploy --tag <full Git SHA>
      curl smoke https://starboard.codevetter.com/
```

The Worker `main` is `worker.mjs`; built assets in `.open-next/assets` are
served via the `ASSETS` binding. `wrangler.jsonc` configures:

- `compatibility_date = "2026-04-01"`,
  `compatibility_flags = ["nodejs_compat", "global_fetch_strictly_public"]`
- `assets = { binding = "ASSETS", directory = ".open-next/assets" }`
- `ai = { binding = "AI" }` (Workers AI for embeddings)
- `services = [{ binding: "RAG_SERVICE", service: "knowledgebase" }]`
- `routes = [{ pattern: "starboard.codevetter.com", custom_domain: true }]`
- `observability = { enabled: true, head_sampling_rate: 0.1 }`
- `limits = { cpu_ms: 30000 }`
- `vars`: `NEXT_PUBLIC_APP_NAME`, `AUTH_URL`, `NEXTAUTH_URL`,
  `STARBOARD_RAG_INDEX_ID`

## Required Cloudflare secrets

Set via `wrangler secret put <NAME>`:

- `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
- `RAG_SERVICE_KEY` (shared RAG; optional — without it relevance search falls
  back to lexical-only)
- `AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY` (only if keeping the HTTP gateway path
active; the Worker prefers the `AI` binding)

Legacy `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` bindings remain untouched
while Turso is rollback-held. They are not runtime requirements for the D1
release and are removed only through a separately approved retirement.

See [env.md](env.md) for the full env map and
[runbooks/rotate-secrets.md](runbooks/rotate-secrets.md) for rotation.

## Landing overlay

`scripts/overlay-astro-landing.mjs` copies `landing-astro/dist/*` over the
OpenNext assets. The landing is an overlay, not a separate product. See
[../architecture/overview.md](../architecture/overview.md).

## Smoke check

The deploy workflow runs:

```bash
curl --fail --silent --show-error --retry 3 --retry-delay 5 --max-time 20 \
  https://starboard.codevetter.com/ > /dev/null
```

A non-200 aborts the workflow.

## Manual deploy

```bash
pnpm deploy:cf        # build:cf + SHA-tagged opennextjs-cloudflare deploy
```

Do not deploy without explicit approval — see the hard rules in
[../../AGENTS.md](../../AGENTS.md) and the fleet standard at `../AGENTS.md`.

## Rollback

See [runbooks/rollback.md](runbooks/rollback.md).
