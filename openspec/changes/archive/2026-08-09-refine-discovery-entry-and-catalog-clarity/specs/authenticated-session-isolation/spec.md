## Purpose

Ensure authenticated identity and credential material never crosses user boundaries through browser-visible static HTML or shared edge caching.

## ADDED Requirements

### Requirement: Authenticated HTML is private

Starboard MUST NOT place authenticated session credentials into publicly cacheable HTML and MUST mark protected page responses private and non-cacheable.

#### Scenario: Guest requests a protected route

- **WHEN** a guest requests Projects or Library
- **THEN** the response requires sign-in without returning a previously cached user identity or access token

#### Scenario: Authenticated user requests a protected route

- **WHEN** an authenticated user opens Projects or Library
- **THEN** the response is rendered for that request and is not stored in a shared public cache

### Requirement: Static and dynamic cache boundaries remain separate

Starboard SHALL cache the static Astro landing and immutable assets independently from dynamic Next.js application routes.

#### Scenario: Public landing is requested

- **WHEN** a visitor opens the static landing page
- **THEN** the landing may use public cache headers because it contains no authenticated session data

#### Scenario: Dynamic application route is requested

- **WHEN** a visitor opens a dynamic Next.js route
- **THEN** the SSG-only static-assets incremental cache does not substitute build-time or another user's HTML response
