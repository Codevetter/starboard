## Why

Starboard presents Discover as a public repository-exploration surface, but the
page redirects guests to the landing page and its API returns `401`. This
breaks the primary guest journey observed by the Fleet public-product audit and
makes authentication provide access rather than personalization.

## What Changes

- Allow guests to browse, search, sort, filter, paginate, and open repository
  details from the seeded Discover corpus.
- Keep user-specific collections, saving, and list filtering authenticated.
- Make the Discover API return public repository data without manufacturing a
  user identity.
- Restore the landing-page public CTA to Discover once the route is genuinely
  usable by guests.
- Add regression coverage for the public API and guest landing contract.

## Capabilities

### New Capabilities

- `public-discovery`: Guest-visible repository discovery with authenticated
  personalization layered on top.

### Modified Capabilities

None.

## Impact

Affected surfaces are the Discover page, Discover API query construction,
guest-visible controls, landing-page CTA, and focused unit/E2E coverage. No
database schema, migration, new dependency, credential, production
configuration, or deployment is required.
