## 1. Reconciliation Core

- [x] 1.1 Add a tested, creation-date-partitioned GitHub catalog enumerator that rejects incomplete, duplicated, truncated, or unstable source evidence.
- [x] 1.2 Replace the persisted cursor walk with one D1 repository-ID read, an in-memory additions diff, and a pre-write maximum-additions gate.
- [x] 1.3 Fetch and validate metadata only for source-only repositories, then insert actual additions in bounded conflict-safe batches.
- [x] 1.4 Record complete reconciliation counts and verified no-op evidence while retaining embedding coverage checks.

## 2. Workflow and Operations

- [x] 2.1 Change the schedule to a non-top-of-hour weekly run and configure the additions safety bound.
- [x] 2.2 Update regression coverage for weekly scheduling, additions-only writes, completeness failure, and the budget circuit breaker.
- [x] 2.3 Update canonical operational docs and public cadence copy to describe weekly full reconciliation and its D1 budget model.

## 3. Verification

- [x] 3.1 Run the smallest focused unit and regression tests for reconciliation and refresh evidence.
- [x] 3.2 Run typecheck, lint, documentation checks, and strict OpenSpec validation.
- [x] 3.3 Review the final diff for accidental deletes, existing-row updates, generated-file edits, secrets, or deployment changes.
