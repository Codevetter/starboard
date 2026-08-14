## Context

See `proposal.md` for motivation. The current job pages a star-sorted GitHub
Search result across multiple daily cursor runs. GitHub caps an individual
search at 1,000 results, repository star counts can reorder paginated results,
and D1 usage is billed by rows read and written. The production table currently
contains roughly 14,500 repository IDs, while the eligible GitHub source set is
roughly 12,400 IDs.

Cloudflare's current free D1 allowance is 5 million rows read and 100,000 rows
written per day. Reading every stored repository ID once consumes roughly
0.3% of that daily read allowance. Normal weekly growth has been under 100
repositories, but source anomalies must be rejected before writes because FTS
triggers and indexes amplify each repository insertion.

## Goals / Non-Goals

**Goals:**

- Establish one complete, reviewable source reconciliation per week.
- Avoid star-order pagination races and GitHub's 1,000-result search window.
- Perform one small D1 ID scan and write only source-only additions.
- Bound the maximum possible write burst before the first mutation.
- Preserve existing embedding and tool-enrichment follow-up behavior for new
  repository rows.

**Non-Goals:**

- Deleting stored repositories that disappear from the source set.
- Refreshing metadata or star counts on existing repository rows.
- Replacing GitHub Search or changing the 5,000-star eligibility contract.
- Running migrations, deploying, or changing Cloudflare plan configuration.

## Decisions

### Partition by immutable repository creation date

The enumerator first records GitHub's total count for `stars:>=floor`, then
recursively splits the inclusive creation-date range from 2007-01-01 through
the current UTC date. A range is accepted only when its total fits in one
100-item response; otherwise it is divided into non-overlapping UTC day ranges.
Any single day that cannot fit one response fails closed.

This uses more requests than ten-page star buckets but stays below both the
30-search-requests/minute bucket (with the existing 2.1-second pacing) and the
workflow token's 1,000-request/hour allowance. Unlike star-count boundaries,
creation dates do not change as stars accumulate, and one-response leaves avoid
pagination reorder races. The job rechecks the root count after enumeration and
requires the before/after counts and unique-ID count to agree.

Alternatives considered:

- Continue star buckets: fewer requests, but ties and changing star order can
  skip or duplicate IDs at result-window boundaries.
- Page all results by stars: impossible beyond GitHub's 1,000-result window.
- List every public GitHub repository: stable ID pagination, but scanning the
  entire public universe to find 5,000-star repositories is not viable.

### Diff compact identities, then fetch additions

Enumeration retains only `id` and `full_name` in a Map. D1 supplies one
`SELECT id FROM repos` result, including repositories that entered through user
sync or project connection. The source-only entries are computed in memory.
Only those entries are fetched from GitHub's repository endpoint to obtain the
metadata needed by `repos`.

This matches the additions-only contract, keeps memory use small, and avoids
re-reading existing D1 rows or retaining full GitHub search payloads. The detail
fetches complete and validate IDs/star eligibility before the first write.

### Fail before writes when additions exceed 100

The scheduled workflow sets `SEED_MAX_ADDITIONS=100`. This accommodates the
observed current gap and normal weekly growth while sharply bounding FTS/index
write amplification. Operators can deliberately override the value for a
bootstrap or recovery dispatch after reviewing Cloudflare capacity.

The gate is evaluated after complete enumeration and the D1 ID read but before
detail fetches or mutations. It is a safety failure, not a partial import.

### Insert additions in small batches without conflict updates

Repository statements use conflict-ignore semantics. Batch results identify
which rows were actually inserted before addition-only snapshots and threshold
events are written. This protects against a concurrent user sync inserting a
repository after the stored-ID snapshot. `cataloged_at` is set only on a new
row. Existing repository rows are never updated by this job.

### Keep reconciliation evidence separate from searchable coverage

The manifest records the complete source total and the planned/inserted
addition counts under a reconciliation step. The existing embedding coverage
gate remains, while the workflow summary exposes the full manifest. A verified
zero-addition run is successful only after source count and identity checks.

## Risks / Trade-offs

- **[GitHub's live corpus changes during enumeration]** → Compare root counts
  before and after and fail before writes if they differ; the next scheduled or
  manual run retries from scratch.
- **[A creation day contains more than 100 eligible repositories]** → Fail with
  the exact date instead of silently truncating; a future timestamp-level
  partition can be added with evidence from GitHub syntax.
- **[A missed weekly run extends discovery delay]** → Keep manual dispatch and
  visible run evidence; schedule away from the top of the hour.
- **[Existing star counts and global momentum snapshots stop refreshing through
  this job]** → This is the explicit cost of additions-only writes. User star
  sync may still refresh connected rows; a separate budgeted popularity
  snapshot design is future work if global growth recency remains required.
- **[Stored-only repositories accumulate]** → Report their count but do not
  delete them until deletion semantics and user-owned references are designed.

## Migration Plan

1. Ship code, workflow, tests, and documentation together on the default branch.
2. The next scheduled run performs a full reconciliation with the 100-addition
   gate; current live evidence indicates fewer than 100 missing IDs.
3. Inspect the run summary and Cloudflare D1 row metrics before considering a
   higher manual limit.
4. Roll back by restoring the prior workflow/script revision. No schema or data
   rollback is required because the change only inserts previously absent rows.
