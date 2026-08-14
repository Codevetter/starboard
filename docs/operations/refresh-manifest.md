# Refresh manifest

Schema and quality gate for `data/refresh-manifest.json`, the structured
record of scheduled-job outcomes. Source of truth for the
`data-research-toolbox-automation` "Refresh lifecycle and quality"
requirement.

## Location

`data/refresh-manifest.json` (gitignored, checkout-local state). Written by
[`src/lib/refresh-manifest.ts`](../../src/lib/refresh-manifest.ts) on every
`seed-popular` run and copied into the GitHub Actions run summary before the
runner is discarded. The manifest path is injectable so tests and other
callers can use isolated storage.
The Cloudflare Worker `/api/health` route cannot read this file (edge
runtime has no `node:fs`); it probes lexical search as the live Worker-side
equivalent and points operators at the Actions run summary for refresh evidence.

The checkout-local file is not durable across GitHub runners. Run summaries
retain per-run evidence, but there is currently no Foundry adapter for a
cross-run latest-watermark/unresolved-failure view.

## Schema

```json
{
  "runs": {
    "seed_reconciliation": {
      "step": "seed_reconciliation",
      "source_watermark": "github_unique_ids:12351",
      "bounds": {"min_stars_floor": 5000, "min_source_repos": 5000, "max_additions": 100, "source_count": 12351, "stored_count": 14500, "planned_additions": 42, "stored_only_count": 2191, "leaf_partitions": 128},
      "timeout_s": 3600,
      "idempotency": "Complete source and stored ID sets are diffed before INSERT OR IGNORE; existing rows are never updated and stored-only rows are never deleted",
      "retries": {"maxAttempts": 4, "backoffBaseMs": 1000, "used": 0},
      "output_count": 42,
      "evidence_status": "produced",
      "quality_signal": {"expected_min_output": 0, "verified_noop_reason": null},
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

A positive output that meets `expected_min_output` is `produced`. Zero output
must include a concrete verified-no-op reason to be `verified_noop`; otherwise
its evidence is `missing`. Missing or below-minimum evidence is marked
`quality_failed: true` and **does not advance freshness**
(`freshness.wall_clock` retains the prior successful run's value). This
catches the "green job writes empty/poor output" failure mode that an exit
code alone would miss.

For `seed-popular`, `expected_min_output` is `0` on `seed_reconciliation` and
`seed_embed`, but zero is accepted only after complete source verification or a
completed pending-embedding query supplies a verified-no-op reason.
`seed_pool_coverage` requires
at least one embedded repo, so an all-zero run fails. Embedding authentication
failure is recorded as `failed` and also fails the job.

`last_failure` records the most recent unresolved failure (step, time, error
message) within one manifest. It is cleared when the failing step next succeeds
while using that same manifest path. Missing files begin a new manifest;
unreadable or malformed prior evidence fails instead of being overwritten.

## Steps tracked

| Step | Source | Idempotency | Expected min output |
| --- | --- | --- | --- |
| `seed_reconciliation` | Complete GitHub Search identity set (≥`MIN_STARS_FLOOR`) + all stored D1 IDs | In-memory diff + addition-only `INSERT OR IGNORE`; no updates/deletes | 0 (a verified complete no-addition run is legitimate) |
| `seed_embed` | Workers AI / free-ai gateway | `repo_embeddings` upsert keyed by `text_hash` | 0 (verified no-pending-work only; auth failure fails the job) |
| `seed_pool_coverage` | D1 aggregate | read-only | 1 |

## Activation counters

Search activation evidence is emitted by
[`src/lib/analytics.ts`](../../src/lib/analytics.ts) `trackSearchOutcome` as
aggregate PostHog events — `search_outcome` (per `/api/stars` search
request, with surface + result-count bucket), `result_inspection` (per repo
detail open from search). **No raw query text, repo IDs, repo full names, or
user identifiers are sent.** See [`foundry.md`](foundry.md) for the
sanitization contract.
