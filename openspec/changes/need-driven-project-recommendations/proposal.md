## Why

Starboard's current project intelligence returns one flat list of similar
projects and grounded tools. Fleet and other users need recommendations organized
around the actual needs of a project — not just "repos that look alike". Issue
#82 asks for a need-driven report: extract 5–10 evidence-backed needs per
high-priority project, search the full eligible catalog independently for each
need, classify candidates, and optionally pass a bounded package to Devin for
final review.

This change implements the deterministic Starboard side of that pipeline and
produces the first concrete artifact: a project intelligence report for every
maintained high-priority Fleet project.

## What Changes

- Add a stable project fingerprint and need-map model to Starboard.
- Build reusable repository capability cards from catalog metadata, tool evidence,
  and AI fingerprints.
- Search the eligible catalog per need using Vectorize, FTS, and structured
  lanes, then deduplicate and score candidates deterministically.
- Classify each candidate as adopt/integrate, reference implementation,
  architectural pattern, competing product, or unsuitable/negative example.
- Cache candidate pools by normalized need signature and catalog generation.
- Add a provider-neutral external-review request contract so Fleet can submit
  one bounded Devin review per changed project without embedding Devin
  credentials in Starboard.
- Add an offline script that runs the deterministic pipeline for the Fleet
  project catalog and emits a structured Markdown report.
- Ship focused unit and integration tests for fingerprinting, need extraction,
  per-need retrieval, classification, idempotency, and failure-safe report
  preservation.

## Capabilities

### New Capabilities

- `need-driven-project-recommendations`: Extract, search, score, classify, and
  persist need-driven project intelligence.
- `repository-capability-cards`: Reusable evidence-backed repository summaries.
- `external-review-ingestion`: Provider-neutral structured-review request and
  result contract.

### Modified Capabilities

- `github-project-connections`: Feed connected project metadata into the
  fingerprint/need pipeline.
- `repo-tool-intelligence`: Provide tool evidence for capability cards and need
  matching.
- `public-project-preview`: Surface need-grouped intelligence for guests when
  previewing a project.

## Impact

- Affects the recommendation service, project intelligence, D1 schema, API
  routes, and offline scripts.
- Reuses existing D1 FTS, Vectorize, Workers AI embedding adapter, and GitHub
  helpers.
- Adds new D1 tables/migrations for fingerprints, needs, candidate pools, and
  external reviews.
- Keeps Devin credentials and session orchestration outside Starboard; Fleet
  automation submits review packages through the ingestion contract.
- Adds no billing gate, OAuth scope change, or private-repository access.
