# Need-Driven Project Intelligence

Starboard's need-driven intelligence pipeline extracts evidence-backed needs
from a connected project, searches the eligible repository catalog
independently for each need, classifies candidates, and produces a structured
report. An optional external reviewer (e.g., Devin) can validate and refine
the report through a provider-neutral ingestion contract.

## Pipeline stages

```text
Connected project
  → fingerprint (README, manifests, tools, AI metadata, topics)
  → need extraction (5–10 evidence-backed needs, fewer when insufficient)
  → per-need retrieval (Vectorize + FTS + structured, cached by signature)
  → candidate classification (5 buckets with confidence and provenance)
  → draft report persistence (versioned, incremental reruns)
  → optional external review ingestion (provider-neutral, idempotent)
```

## Key design decisions

- **Deterministic first.** Starboard always produces a draft report without
  any external reviewer. Devin is optional, not required.
- **Per-need retrieval.** Each need generates focused search intents and
  queries the full eligible catalog independently. Agents never receive all
  12k repository records.
- **Reusable capability cards.** One evidence-backed card per catalog
  repository, refreshed only when the source fingerprint changes.
- **Cached candidate pools.** Projects with similar needs reuse retrieval
  work via normalized need signatures.
- **Incremental reruns.** A run is skipped when the project fingerprint, need
  map, and catalog generation are unchanged.
- **Failure-safe.** Degraded runs preserve the latest successful report.
  External review failure or budget exhaustion never replaces the draft.
- **No Devin credentials in Starboard.** Fleet automation owns Devin
  credentials, session creation, polling, and spend limits. Starboard only
  ingests structured review results.

## Classification buckets

| Bucket | Meaning |
|--------|---------|
| `adopt_or_integrate` | Suitable to use now |
| `reference_implementation` | Study and borrow patterns |
| `architectural_pattern` | Learn from design choices |
| `competing_product_to_monitor` | Monitor, not adopt |
| `unsuitable_negative_example` | Explicitly exclude with rationale |

## API endpoints

- `GET /api/projects/[slug]/intelligence` — read persisted draft and reviewed
  reports. Pass `?run=1` to trigger a deterministic pipeline run if no report
  exists. Never triggers external-agent spend.
- `POST /api/internal/project-intelligence/run` — operator-only pipeline run
  for a specific project. Requires `AI_GATEWAY_API_KEY` bearer token.
- `POST /api/internal/external-reviews/ingest` — operator-only review result
  ingestion. Idempotent via idempotency key. Requires `AI_GATEWAY_API_KEY`.

## Database tables

Migration `0004_need_driven_intelligence.sql` adds:

- `repo_capability_cards` — reusable evidence-backed repository summaries
- `project_fingerprints` — stable project input fingerprints
- `project_needs` — extracted needs with signatures and search intents
- `need_candidate_pools` — cached candidate lists by need signature
- `project_draft_reports` — deterministic draft reports (versioned, latest flag)
- `external_review_requests` — idempotent review request tracking
- `project_reviewed_reports` — final reviewed reports (latest flag)

## Bounds and safety

- Max 10 needs per project, fewer when evidence is insufficient
- Max 80 semantic candidates, 200 lexical, 120 structured per need
- Max 8 candidates per need, 50 total across all needs
- One bounded external review session per changed project
- All external-repository operations are read-only
- No production credentials or private data sent to external reviewers

## Source

- `src/lib/need-driven-intelligence.ts` — pipeline implementation
- `src/__tests__/need-driven-intelligence.test.ts` — unit tests
- `scripts/fleet-project-intelligence.ts` — offline Fleet report generator
- `src/app/api/projects/[slug]/intelligence/route.ts` — read API
- `src/app/api/internal/project-intelligence/run/route.ts` — operator run API
- `src/app/api/internal/external-reviews/ingest/route.ts` — review ingestion API
