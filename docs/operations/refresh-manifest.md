# Refresh manifest

Schema and quality gate for `data/refresh-manifest.json`, the structured
record of scheduled-job outcomes. Source of truth for the
`data-research-toolbox-automation` "Refresh lifecycle and quality"
requirement.

## Location

`data/refresh-manifest.json` (gitignored — operator-local state). Written by
[`src/lib/refresh-manifest.ts`](../../src/lib/refresh-manifest.ts) on every
`seed-popular` run and read by operators / future operator-only endpoints.
The Cloudflare Worker `/api/health` route cannot read this file (edge
runtime has no `node:fs`); it reports Turso reachability as the live
Worker-side equivalent and points operators at this file for refresh
watermark/freshness evidence.

## Schema

```json
{
  "runs": {
    "seed_walk": {
      "step": "seed_walk",
      "source_watermark": "cursor_after_walk",
      "bounds": {"metadata_page_limit": 120, "min_stars_floor": 5000, "max_pages_per_bucket": 10},
      "timeout_s": 3600,
      "idempotency": "INSERT … ON CONFLICT(id) DO UPDATE for repos; INSERT OR IGNORE for repo_star_snapshots and repo_threshold_events",
      "retries": {"maxAttempts": 4, "backoffBaseMs": 1000, "used": 0},
      "output_count": 312,
      "quality_signal": {"expected_min_output": 0},
      "quality_failed": false,
      "error": null,
      "freshness": {"wall_clock": "2026-07-18T03:14:22Z", "delta_s_from_prior": 86412}
    },
    "seed_embed": { "step": "seed_embed", "…": "…" },
    "seed_pool_coverage": { "step": "seed_pool_coverage", "…": "…" }
  },
  "last_failure": null
}
```

## Quality gate

A step that exits successfully with `output_count < expected_min_output` is
marked `quality_failed: true` and **does not advance freshness**
(`freshness.wall_clock` retains the prior successful run's value). This
catches the "green job writes empty/poor output" failure mode that an exit
code alone would miss.

For `seed-popular`, `expected_min_output` is `0` on `seed_walk` and
`seed_embed` because a catch-up run that finds no new repos or has no embed
budget left is legitimate. The quality signal for the pool is the
`seed_pool_coverage` step's `output_count` (embedded-in-pool count) and the
ratio against the seeded-pool size, which operators inspect in the Action
logs (`[done] pool ≥5000 stars: X/Y embedded`).

`last_failure` records the most recent unresolved failure (step, time, error
message). It is cleared when the failing step next succeeds.

## Steps tracked

| Step | Source | Idempotency | Expected min output |
| --- | --- | --- | --- |
| `seed_walk` | GitHub Search (≥`MIN_STARS_FLOOR`) | `repos` upsert + `INSERT OR IGNORE` snapshots/events | 0 (catch-up runs are legitimate) |
| `seed_embed` | Workers AI / free-ai gateway | `repo_embeddings` upsert keyed by `text_hash` | 0 (auth-failure skip is recorded, not fatal) |
| `seed_pool_coverage` | Turso aggregate | read-only | 0 |

## Activation counters

Search activation evidence is emitted by
[`src/lib/analytics.ts`](../../src/lib/analytics.ts) `trackSearchOutcome` as
aggregate PostHog events — `search_outcome` (per `/api/stars` search
request, with surface + result-count bucket), `result_inspection` (per repo
detail open from search). **No raw query text, repo IDs, repo full names, or
user identifiers are sent.** See [`foundry.md`](foundry.md) for the
sanitization contract.
