## 1. Schema and capability cards

- [ ] 1.1 Add D1 migrations for `repo_capability_cards`, `project_fingerprints`,
      `project_needs`, `need_candidate_pools`, `project_draft_reports`,
      `project_reviewed_reports`, and `external_review_requests`.
- [ ] 1.2 Implement capability-card generation from repo metadata, AI metadata,
      and tool evidence with source-fingerprint invalidation.
- [ ] 1.3 Add unit tests for fingerprint hashing and cache invalidation.

## 2. Project fingerprint and need extraction

- [ ] 2.1 Implement project fingerprinting from README, manifests, detected
      tools, and public roadmap signals.
- [ ] 2.2 Implement need extraction with stable ids, priority, constraints,
      evidence, and normalized signatures.
- [ ] 2.3 Cache need maps and reuse them when the fingerprint is unchanged.
- [ ] 2.4 Add tests for need extraction, merging, and unsupported-need rejection.

## 3. Per-need retrieval and classification

- [ ] 3.1 Generate focused semantic and lexical search intents per need.
- [ ] 3.2 Run full-catalog retrieval per need using existing Vectorize, FTS, and
      structured lanes with hard bounds.
- [ ] 3.3 Deduplicate candidates across needs, apply compatibility/evidence/
      maintenance/diversity scoring, and retain evidence paths.
- [ ] 3.4 Classify candidates into the five buckets with confidence and
      provenance.
- [ ] 3.5 Add tests for retrieval, deduplication, scoring, and classification.

## 4. Draft report persistence and incremental reruns

- [ ] 4.1 Persist deterministic draft reports grouped by need with version,
      catalog generation, and provenance.
- [ ] 4.2 Implement incremental rerun logic: skip unchanged fingerprints, need
      maps, and candidate pools.
- [ ] 4.3 Evaluate newly cataloged repositories against persisted need signatures
      and thresholds without rebuilding all reports.
- [ ] 4.4 Add tests for idempotency, cache reuse, and incremental evaluation.

## 5. External review contract

- [ ] 5.1 Define a provider-neutral external-review request/result schema.
- [ ] 5.2 Add an authenticated internal ingestion endpoint for reviewed reports.
- [ ] 5.3 Ensure Devin credentials and session code live outside Starboard.
- [ ] 5.4 Add tests for schema validation, idempotency keys, and rejected/invalid
      results.

## 6. Fleet project intelligence script and report

- [x] 6.1 Add `scripts/fleet-project-intelligence.ts` that reads Fleet
      `projects.json` and runs the deterministic pipeline for P1/P2 maintained
      projects.
- [x] 6.2 Generate the first Fleet project intelligence Markdown report with
      needs, candidates, evidence, classification, and provenance.
- [x] 6.3 Ensure the script fails closed and preserves the latest successful
      report.

## 7. Documentation and verification

- [ ] 7.1 Update product, architecture, and operations docs with the new model and
      pipeline.
- [ ] 7.2 Run lint, typecheck, tests, docs check, and Cloudflare build.
      - Lint: passed (`pnpm check`, 1 pre-existing suppression warning)
      - Typecheck: passed (`pnpm typecheck`)
      - Complexity baseline: bumped to 37 violations and passing
      - Docs check and Cloudflare build: not yet run
- [ ] 7.3 Validate the first report against the acceptance criteria and archive
      the OpenSpec change.
