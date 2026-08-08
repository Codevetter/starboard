# How to organize and semantically search GitHub starred repositories

GitHub's native stars page is the right starting point: it can group starred repositories into public lists, filter and sort them, and search by repository name or topic. When a starred library grows large, an additional read-only layer can help you find repositories by meaning, maintenance activity, notes, and the work you are doing now.

## Start with GitHub's native tools

Use GitHub lists when a small number of stable public categories is enough. A separate organizer becomes useful when you want to search by meaning, combine activity and maintenance filters, add private notes or tags, revisit changed repositories, or group tools for a project.

## What semantic search adds

Starboard combines SQLite FTS5 over repository names, descriptions, and topics with embedding retrieval. Reciprocal-rank fusion blends both result sets, with lexical fallback when the semantic service is unavailable.

Semantic similarity does not prove that a repository is good, maintained, secure, or appropriate for your stack. It improves recall; source inspection, releases, maintenance evidence, and your judgment still determine whether to use a repository.

## A practical organization workflow

1. Sync read-only metadata; Starboard does not request repository write scopes.
2. Create a few durable, outcome-shaped collections.
3. Add language, workflow, status, or personal-use tags.
4. Search by intent instead of guessing a project name.
5. Review releases, activity, archival state, and revisit history.
6. Inspect the source and license, then star or unstar through GitHub.

## How Starboard differs from a basic tag manager

Starboard combines tags, collections, and notes with hybrid retrieval, similar-project grounding, repository-sourced tool recommendations, and public discovery. The service is free. This is a product-surface description, not a claim that one organizer is universally better.

## Limits and privacy

Starboard is not a replacement for GitHub, a security scanner, or an endorsement engine. Results can be incomplete or stale. Account permission is read-only, but synced metadata, tags, lists, and notes still become application data. Review the privacy page and revoke access from GitHub settings whenever you stop using the service.

[Browse public repositories](/discover) without connecting GitHub. See [Tools](/tools) and the [Changelog](/changelog) for current surfaces and shipped changes.
