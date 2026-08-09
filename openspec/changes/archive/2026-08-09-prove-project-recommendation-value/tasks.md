## 1. Recommendation retrieval

- [x] 1.1 Extract candidate hydration and project recommendation retrieval into a shared server-only service.
- [x] 1.2 Add bounded Vectorize, FTS, and same-language candidate lanes across the eligible catalog with deterministic fusion and honest fallback metadata.
- [x] 1.3 Replace the connected-project route's top-500 popularity pool with the shared service and cover hybrid, degraded, and fallback behavior with focused tests.
- [x] 1.4 Add a fixed evaluation fixture that catches popularity-prefix regressions and verifies relevant lower-star peers can reach the grounding set.

## 2. Public project preview

- [x] 2.1 Add catalog-first public project resolution and a read-only preview API that performs no user-data writes.
- [x] 2.2 Add the public `/project-preview` surface with loading, invalid, unavailable, degraded, recommendation, and sign-in handoff states.
- [x] 2.3 Add preview API and flow tests, including catalog hits, GitHub misses, and non-persistence assertions.

## 3. GitHub project activation

- [x] 3.1 Add an authenticated, bounded public-repository picker endpoint using the existing GitHub token and no broader scope.
- [x] 3.2 Add the on-demand picker and callback-prefilled manual connection path to Projects while preserving the URL fallback.
- [x] 3.3 Add focused picker API and Projects interaction tests.

## 4. Product evidence and framing

- [x] 4.1 Replace digest-era analytics with privacy-safe project connection, recommendation view, inspection, and binary feedback events.
- [x] 4.2 Add repository/tool inspection tracking, compact useful/not-useful controls, retrieval-state copy, support strength, and Tool Intelligence links.
- [x] 4.3 Reframe the static landing hero and product demonstration around public project preview and similar-project-grounded tool evidence.

## 5. Documentation and verification

- [x] 5.1 Update current product, status, architecture, route, and analytics documentation; remove remaining shipped-state and digest-era inconsistencies.
- [x] 5.2 Run targeted tests, typecheck, lint, docs checks, strict OpenSpec validation, and the production Cloudflare build.
- [x] 5.3 Complete preserve-lane responsive review at 390, 768, and 1440 pixels, critique, polish, audit, detector review, and the design receipt.

## 6. Production-audit hardening

- [x] 6.1 Fix Discover and Library request cancellation and add a regression guard for stable filter changes.
- [x] 6.2 Fuse bounded semantic and lexical candidates for public Discover with an honest lexical fallback.
- [x] 6.3 Require meaningful peer evidence, exclude language and weak detections, and require corroboration for grounded tool recommendations.
- [x] 6.4 Keep catalog previews public while requiring the existing GitHub session token for uncataloged lookups; preserve the post-login repository handoff.
- [x] 6.5 Add bounded API pagination and server-side filtering to Tool Intelligence repository evidence.
- [x] 6.6 Move repository detail into the shared shell, repair landmarks/headings/back navigation, and remove the peripheral discussion UI without deleting stored data.
- [x] 6.7 Prevent the signed-out Projects workspace flash and repair Web Vitals CSP/version observability.
- [x] 6.8 Expand Playwright coverage to the actual Astro landing and mocked core public journeys at desktop and mobile widths.
- [x] 6.9 Remove strict-Knip findings and the non-compliant bounce easing advisory.
- [x] 6.10 Run targeted tests after each lane, then full lint, typecheck, coverage, E2E, docs, strict Knip, Cloudflare build, diff validation, and production-profile browser review.
