## Context

See `proposal.md` for motivation. Connected-project recommendations currently
hydrate the 500 most-starred eligible repositories and apply deterministic
evidence scoring in memory. The repository already has D1 FTS5 indexes,
project-owned Vectorize, a 768-dimensional Workers AI embedding adapter, and a
semantic similar-repository route, but the Projects path does not reuse them.
The Astro landing is static by design, while authenticated product surfaces are
Next.js client/server routes.

## Goals / Non-Goals

**Goals:**

- Retrieve a bounded candidate set from the full eligible catalog rather than a
  popularity prefix, then retain deterministic evidence reranking and tool
  provenance.
- Let guests prove value with transient public project context and carry that
  context through sign-in without writing user data first.
- Preserve minimal GitHub scope, existing visual language, and degraded states.
- Emit useful activation and feedback events without repository identity.

**Non-Goals:**

- Private repository access, GitHub App installation, broader OAuth scopes, or
  organization administration.
- A learned ranker, automated model training, personalized recommendations, or
  storing free-form feedback.
- Billing, entitlements, background alerts, reports, Radar, Stack Builder, or
  weekly digest behavior.
- A new design system or landing-page visual overhaul.

## Decisions

### 1. One recommendation service owns candidate retrieval and reranking

Extract the route's candidate work into a server-only project intelligence
service. It accepts project metadata plus a result limit and returns the current
ranked result with retrieval metadata. Authenticated and preview routes use the
same service so preview quality cannot drift from the saved-project path.

Alternative: call the existing similar-repository HTTP route. Rejected because
it requires an authenticated request, assumes an existing repo vector, returns
a different data shape, and would create an internal HTTP hop.

### 2. Candidate generation is bounded hybrid retrieval

Build project text from public metadata. Request up to 100 Vectorize neighbors,
using the existing vector by repository id when available and a transient
Workers AI embedding otherwise. Independently query the existing repository and
AI-metadata FTS indexes across all eligible catalog rows, plus an indexed
same-language candidate lane. Fuse candidate ids with reciprocal rank fusion,
cap hydration, then apply the existing evidence scorer. If semantic work fails,
continue with lexical/structured candidates. If all specific lanes are empty,
hydrate a small popularity fallback and mark it broad.

Alternative: scan and hydrate the entire catalog. Rejected because it moves
unbounded data through a user-facing Worker and will become less safe as the
catalog grows.

Alternative: persist a new vector synchronously for every preview. Rejected
because a transient preview must not mutate catalog state and connection should
not depend on Workers AI availability.

### 3. Preview is a cacheable, read-only API and a dedicated product surface

The static landing submits a GET form to `/project-preview`. The Next.js preview
surface calls a public GET API with the normalized public repository value.
Resolution checks the local catalog first. Catalog hits remain public. A cache
miss no longer calls GitHub anonymously from the shared Worker egress path: an
authenticated session token may resolve the repository, while a guest receives
a sign-in handoff that preserves the repository value. The response never
writes `user_projects` or other user-owned tables. The connect CTA signs in and
returns to `/projects?repository=...`, where the manual form is prefilled for an
explicit final connection.

Alternative: connect automatically after OAuth. Rejected because the user
should still see and confirm the durable write boundary.

### 4. GitHub repository choices load only on demand

Add an authenticated endpoint that requests one bounded page of public
repositories through the existing session token. The Projects form loads it
only after the user opens the picker and retains URL entry as the fallback.
No new permission is requested.

### 5. Analytics is categorical and identity-free

Replace digest-era event types with project activation, recommendation-set,
inspection, and binary feedback events. Properties are categorical buckets:
manual versus picker, repository versus tool, result/rank/support/confidence
buckets, fallback state, and retrieval mode. Repository ids, names, URLs,
descriptions, topics, and query strings are forbidden in these events.

### 6. Frontend work stays in the preserve lane

Keep the current dark technical visual language, tokens, typography, components,
and navigation. Recompose the landing hero around a real repository input and
replace the obsolete Hot/Watch/Stale library mock with a project-to-peers-to-tool
evidence demonstration. Projects gains an on-demand picker, explicit retrieval
state, inspect actions, and compact feedback controls; it does not become a new
dashboard.

## Risks / Trade-offs

- **Workers AI or Vectorize is temporarily unavailable** → Continue through FTS
  and language candidates, report the retrieval mode, and never turn the error
  into a failed project connection.
- **Unauthenticated GitHub quota is exhausted or preview is abused** → Never
  spend shared anonymous GitHub quota on a guest request. Resolve cataloged
  repositories locally and require the existing minimal GitHub session for an
  uncataloged lookup. A broader edge rate limiter remains outside this change
  because it previously affected unrelated product requests.
- **Minimal OAuth token returns fewer repositories than expected** → Present the
  picker as a convenience, label it public-only, and keep manual URL entry
  primary and fully functional.
- **FTS OR queries become noisy** → Keep deterministic structured evidence as
  the final ranker, cap each lane, and add fixed recommendation-quality fixtures.
- **Binary analytics cannot identify a specific bad repository** → Accept the
  privacy trade-off for this pass; use aggregate evidence to decide where an
  opt-in labeled evaluation system is warranted later.

## Migration Plan

1. Ship service and API behavior with tests before exposing the preview form.
2. Ship preview, picker, analytics, and preserved-lane UI together so every CTA
   lands on a working path.
3. Run targeted tests, typecheck, lint, docs/OpenSpec checks, production build,
   and responsive visual review before release.
4. Roll back by reverting this change; it adds no schema, dependency, OAuth
   scope, secret, or production binding migration.

## Hardening decisions after production audit

### 7. Search requests own only their request lifetime

The SWR fetcher aborts the previous request before installing a new controller.
Filter effects reset pagination but never abort the request that SWR just
started. Discover fuses bounded Vectorize matches with FTS matches and degrades
to lexical results when Workers AI or Vectorize is unavailable.

### 8. Recommendation evidence has an admission floor

Primary-language equality remains contextual evidence but cannot admit a peer
by itself. A peer needs a meaningful shared topic, exact tool, tool-area, or
multiple contextual signals. Tool additions exclude language metadata and
low-confidence detections, and need corroboration from at least two admitted
peers.

### 9. Large evidence collections paginate at the API boundary

Tool detail requests use a small bounded page with offset metadata and an
explicit Load more action. Filtering is server-side so pagination does not make
search incomplete. The DOM therefore grows only when the user asks for more.

### 10. Core product routes share one shell

Repository detail uses `AppShell` and `TopBar`, exposes a real main landmark and
page heading, and returns guests to Discover. The discussion UI is removed so
the surface focuses on repository evidence, similar projects, and detected
tools; existing database records are preserved.
