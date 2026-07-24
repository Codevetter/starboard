## Context

Discover currently has two independent authentication gates: the client page
redirects unauthenticated sessions to `/`, and `GET /api/discover` rejects them.
The underlying corpus is already public seeded repository data. Personal fields
come from nullable joins keyed by the authenticated GitHub user, while list
filtering and save/list mutations use separate authenticated endpoints.

## Goals / Non-Goals

**Goals:**

- Serve the shared seeded corpus to guests.
- Preserve saved/list state and collection controls for authenticated users.
- Avoid querying or inventing another user's personalized state.
- Keep repository detail navigation public.

**Non-Goals:**

- Exposing private stars, collections, recommendations, radar, or mutations.
- Changing OAuth scopes, database schema, seeding, or deployment.
- Adding anonymous write capabilities.

## Decisions

### Use nullable personalization in the existing Discover query

The API resolves `userId` to the authenticated GitHub id or `null`. Existing
left joins use that nullable value, so guests receive false/empty personal
fields while the shared repository corpus and public facets remain identical.
This avoids duplicating a large query and keeps sorting/search behavior aligned.

An attempted `list_id` filter without authentication returns `401`, because a
collection id is user-owned even though the base feed is public.

### Disable personal hooks and controls for guests

The list hook accepts an `enabled` flag and does not request `/api/lists` for
guests. Discover omits collection, save, and list-assignment controls unless a
session is authenticated. Language/tool filters, search, sort, pagination, and
detail links remain available.

### Keep public and private navigation visibly distinct

The shared top bar hides private destinations and the account dropdown for
guests and offers a clear GitHub connection handoff. The landing CTA returns to
`/discover` after the route is public.

## Risks / Trade-offs

- **Nullable SQL bindings behave differently across adapters** → focused API
  tests assert the guest query shape and production build/typecheck exercise
  the libSQL types.
- **A query-string list filter could imply public collection access** → reject
  guest `list_id` explicitly and omit the control from guest UI.
- **Public reads increase database traffic** → reuse the existing bounded
  pagination and seeded-corpus query; no anonymous mutations or embedding work
  are introduced.

## Migration Plan

No data migration is required. Deploy the code normally after tests and build
pass. Rollback is a code revert restoring the page/API auth gates.

## Open Questions

None.
