# ADR-0009 — Cloudflare D1 + Vectorize replaces Turso/libSQL

Status: Accepted for the migration branch; production cutover requires the
separate receipt approval gate in GitHub issue #49.

## Context

Starboard already runs on Cloudflare Workers but kept relational data and ANN
vectors in Turso. That split added a second database vendor, an HTTP client in
the Worker bundle, and a Turso-specific vector schema. The source database is
about 2.13 GB, which fits the paid D1 10 GB per-database limit. D1 supports the
SQLite/FTS5 relational shape but not libSQL's `F32_BLOB` vector functions.

## Decision

- Store relational data, ownership, FTS5 indexes, and embedding drift hashes in
  one project-owned D1 database bound as `DB`.
- Store 768-dimensional cosine repository vectors in the project-owned
  Vectorize index `starboard-repos`, bound as `REPO_VECTORS`.
- Keep route/domain SQL behind a small D1 adapter so result shapes remain
  stable without introducing an ORM.
- Run Node operator jobs through Cloudflare's authenticated D1 and Vectorize
  REST APIs. Do not expose a public raw-SQL maintenance endpoint.
- Use ordered files in `migrations/`, local D1 isolation, a write-freeze flag,
  deterministic dump/vector converters, receipts, and a rollback hold on Turso.

## Rationale

This keeps the application, relational store, vector store, and AI execution on
Cloudflare while retaining the existing raw-SQL domain code. Separating ANN
values from D1 is the smallest compatible replacement for libSQL vector
extensions; D1 still owns the relational metadata used to detect embedding
drift and hydrate search results.

## Tradeoffs

- Vector writes are eventually visible and must complete before the D1
  `text_hash` is advanced; both paths are idempotent.
- Operator Actions need a scoped Cloudflare token with D1/Vectorize permissions.
- Model/dimension changes require a deliberate replacement Vectorize index and
  re-embedding rather than automatic table surgery.
- Turso remains rollback-held until retirement receives separate approval.

## Supersedes

- [0003](0003-opennext-libsql-bundling.md)
- [0004](0004-turso-f32-blob-vectors.md)
- [0006](0006-embedding-dimension-contract.md), only its Turso enforcement path
