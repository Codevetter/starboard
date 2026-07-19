# Foundry snapshot sanitization

Contract for what Starboard may emit to Foundry (the shared fleet PostHog
project). Satisfies the `data-research-toolbox-automation` "Search activation
evidence" and "Bounded Toolbox marketing" requirements.

## Rule

Starboard emits **only** aggregate, privacy-safe counters to Foundry. It
never sends:

- raw query text from `/api/stars` or any search surface
- repo IDs, repo full names, owner logins, or HTML URLs
- user identifiers, GitHub IDs, session IDs, or IP addresses
- README text, repo descriptions, or any corpus content
- private repository identity (the `insight_reports` table defaults to
  `redact_private=1` for shared reports; Foundry events carry no repo
  identity at all)

## Events

| Event | When | Properties |
| --- | --- | --- |
| `signup` | first session after account creation | `project_id` |
| `activated` | first successful star sync | `project_id` |
| `core_action` | each sync / list-created action | `project_id`, `action` (`repos_synced`/`list_created`) |
| `returned` | return session by a user with prior activity | `project_id` |
| `search_outcome` | every `/api/stars` search with a query | `project_id`, `surface` (`lexical`/`semantic`/`discover`), `result_count_bucket` (`zero`/`1-5`/`6-20`/`21+`), `result_count_exact_capped` (≤100) |
| `result_inspection` | a user opens a repo detail from search results | `project_id`, `surface` (`repo_detail`) |
| `digest_opened` | weekly maintainer digest rendered | `project_id`, `digest_id`, `item_count` |
| `digest_item_actioned` | digest item reviewed/dismissed | `project_id`, `digest_id`, `item_id`, `group`, `action` |
| `error_captured` | React error boundary fires | `project_id`, `route`, `scope`, `digest`, `source`, `message`, `stack` |
| `foundry_page_crash` | window error / unhandled rejection | `project_id`, `route`, `source`, `message`, `stack` |
| `foundry_auth_failure` | NextAuth sign-in/callback fails | `project_id`, `route`, `provider`, `stage`, `reason`, `source` |
| `experiment_exposure` | a bounded Toolbox experiment exposes a variant | `project_id`, `experiment_id`, `variant`, `destination`, `attribution` |

## Implementation

- Server-side emission: [`src/lib/analytics.ts`](../../src/lib/analytics.ts)
  (`emitServer` posts to the PostHog capture API; fire-and-forget, never
  raises into the request path).
- Browser-side emission: [`src/lib/foundry-monitoring.ts`](../../src/lib/foundry-monitoring.ts)
  (posthog-js, lazy-loaded so it never runs during SSR).
- Web vitals: [`src/lib/vitals.ts`](../../src/lib/vitals.ts) (LCP/CLS/INP/TTFB/FCP).
- Same shared PostHog project key across all three modules.

## Private-repo redaction

- `insight_reports.redact_private` defaults to `1` — shared reports redact
  private repo identity by default (see
  [`src/db/schema.sql`](../../src/db/schema.sql)).
- Foundry activation events carry **no** repo identity. The `search_outcome`
  event has only the surface and result-count bucket; `result_inspection`
  has only the surface name.
- The knowledgebase RAG index stores `full_name` in document metadata for
  result-to-repo mapping; this is the search backend (user-scoped via
  `user_id` in the index), not Foundry, and is not covered by this
  sanitization contract.

## Verification

A future audit task (deferred — not blocking this capability) should grep
all `track*` and `emit*` call sites to confirm no PII / query text / repo
identity is passed. The current call sites are limited to
[`src/lib/analytics.ts`](../../src/lib/analytics.ts) exports and
[`src/app/api/stars/route.ts`](../../src/app/api/stars/route.ts).
