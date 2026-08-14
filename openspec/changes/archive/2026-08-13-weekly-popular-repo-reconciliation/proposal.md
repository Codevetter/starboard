## Why

The daily cursor walk spreads one logical GitHub catalog reconciliation across
roughly two weeks, so a green run cannot prove that Starboard currently contains
every public repository above the 5,000-star floor. The catalog is small enough
to reconcile completely in one weekly run while keeping D1 reads far below the
Cloudflare free allowance and avoiding rewrites of existing rows.

## What Changes

- Replace the daily resumable star cursor with a weekly complete GitHub Search
  enumeration of repositories at or above the configured star floor.
- Read the existing eligible repository IDs from D1 once, diff both ID sets in
  memory, and insert only repository IDs absent from D1.
- Reject incomplete or non-exhaustive GitHub results before any D1 write.
- Add a conservative additions circuit breaker that fails before writes when an
  unexpectedly large source delta could threaten the D1 write budget.
- Keep deletion and routine metadata refresh out of scope; existing repository
  rows remain untouched, and source-only additions continue through the existing
  embedding and tool-enrichment steps.
- Publish reconciliation counts and budget bounds in refresh evidence and update
  the operational documentation.

## Capabilities

### New Capabilities

- `popular-catalog-reconciliation`: Complete, additions-only reconciliation of
  GitHub's public repository catalog above the configured star floor.

### Modified Capabilities

None.

## Impact

- Scheduled workflow: `.github/workflows/seed-popular.yml`
- Operator job: `scripts/seed-popular.ts`
- Refresh evidence and regression tests under `src/lib/` and `src/__tests__/`
- Operational documentation and `PROJECT_STATUS.md`
- External systems: GitHub Repository Search, Cloudflare D1, Workers AI, and
  Vectorize; no new production dependency, migration, deployment, or deletion
  path is introduced.
