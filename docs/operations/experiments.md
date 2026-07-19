# Bounded Toolbox marketing experiments

Quiet, expiring discoverability experiments for Starboard. Satisfies the
`data-research-toolbox-automation` "Bounded Toolbox marketing" requirement.

## Rule

Experiments MUST:

- declare a canonical destination URL (no broad funnel drift)
- declare an attribution source (`utm_source`, `utm_medium`, `utm_campaign`)
- use only approved claims (see `approved_claims` below)
- declare an expiry timestamp; expired experiments stop exposing
- declare a stop rule (metric threshold or date after which the variant is
  withdrawn even if the expiry has not passed)
- record exposure via the `experiment_exposure` Foundry event (see
  [`foundry.md`](foundry.md))

Experiments MUST NOT:

- trigger corpus expansion (e.g. lowering `MIN_STARS_FLOOR`, adding non-GitHub
  providers), ranking redesign, or new paid data sources
- alter the embedding model, the RAG index, or the recommendation scorer
  weights outside the eval harness
- promote Starboard into "My Work" or any commercial roadmap surface
- run without an explicit `experiment_id` and `expiry`

## Manifest

`data/experiments-manifest.json` (gitignored — operator-local state). Schema:

```json
{
  "experiments": [
    {
      "id": "2026-07-discover-cta",
      "hypothesis": "A Discover CTA on the stars dashboard increases /discover visits.",
      "destination": "https://starboard.codevetter.com/discover",
      "attribution": {"utm_source": "dashboard", "utm_medium": "internal", "utm_campaign": "discover-cta"},
      "approved_claims": ["Discover popular repositories trending this week."],
      "starts_at": "2026-07-20T00:00:00Z",
      "expires_at": "2026-08-20T00:00:00Z",
      "stop_rule": "Withdraw if /discover visits fall below 5/day for 7 consecutive days.",
      "status": "draft",
      "notes": "Launch nothing until status=active is set by the operator."
    }
  ]
}
```

## Approved claims

The set of product claims experiments may use. Update this list when the
shipped feature set changes; do not let experiments make claims the product
does not deliver.

- "Search and organize your GitHub stars with semantic and full-text search."
- "Discover popular repositories trending this week."
- "Fleet-aware recommendations for your projects."
- "Radar maintainer and release signals with weekly alerts."
- "Shareable insight reports at stable public URLs."

## Current state

No experiments are active. The manifest schema and this doc are the
controls; launching an experiment is a separate, operator-approved step
that does not happen automatically from this capability work.
