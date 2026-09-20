---
title: "Designing public repository discovery before sign-in"
slug: designing-public-repository-discovery-before-sign-in
target_query: open source repository discovery
search_intent: Developers evaluating how to find and evaluate open-source tools without immediately connecting their GitHub identity.
meta_title: Designing Public Repository Discovery Before Sign-in | Starboard
meta_description: How Starboard enables open-source repository discovery and tool intelligence for developers before requiring GitHub authentication.
---

## Outline

1. **Introduction**: The friction of authentication in developer tool discovery.
2. **The Seeded Public Corpus**: Establishing a baseline of repository data for unauthenticated users.
3. **Designing the Guest Experience**: Graceful degradation of features and server-rendered resilience.
4. **Evidence-Backed Tool Intelligence**: Surfacing deep repository insights, dependencies, and platform usage to guests.
5. **Search Capabilities and Fallbacks**: Fusing semantic and lexical search while maintaining reliability.
6. **The Boundary of Authentication**: Transitioning from public discovery to project-aware recommendations with minimal permissions.
7. **Next Action**: A practical step for developers to explore the public discovery surface.
8. **Source Notes**: Internal references for product claims.

## Introduction

Developers evaluating open-source projects and tools face a common hurdle when adopting new discovery platforms: the immediate demand for GitHub authentication. While connecting an identity account allows for highly personalized, project-aware recommendations, placing an authentication wall in front of the core discovery experience prevents developers from evaluating the tool's immediate utility.

When building Starboard—a project-aware repository discovery platform—we made a deliberate architectural and product choice: repository discovery must be genuinely useful before a user ever signs in. Success for us means a developer can understand technical context and find a useful repository to evaluate without manually trawling GitHub or maintaining a separate internal project catalog.

This article explores how we designed the public repository discovery experience in Starboard. It details how we balance the immediate utility of a seeded public corpus with the eventual personalized power of connected GitHub projects. By adhering to the principle of asking for the least amount of GitHub access necessary, we ensure that the public discovery surface and tool intelligence features remain robust, transparent, and friction-free.

## The Seeded Public Corpus

To make discovery useful without authentication, a platform needs a substantial baseline of data. Rather than presenting a blank slate or an empty dashboard to new visitors, Starboard relies on a seeded public repository corpus. This corpus acts as the foundation for the `/discover` surface, allowing unauthenticated users to explore popular open-source repositories immediately.

The system populates this data using scheduled GitHub Actions that reconcile and insert missing popular repositories into our Cloudflare D1 database. A weekly, additive-only seed run walks the GitHub search API for repositories with significant star counts (specifically targeting repositories with 5,000 or more stars). It fetches metadata and generates embeddings via native Cloudflare Worker bindings. To ensure reliability, this seeding process is designed with robust error handling; the GitHub search incorporates retries for transient network and 5xx failures using bounded exponential backoff, and the seed walk itself has a hard per-run page bound with conflict-safe snapshot inserts and resumable cursors.

By surfacing this seeded corpus publicly, we remove the "cold start" problem for guests. An unauthenticated developer visiting the Discover page can immediately browse, search, sort, filter, and paginate through this shared catalog. They can open repository details, view stored 30-day star history, and examine detected tools—all without triggering a user-data write or exposing their GitHub identity. The data they see is the same high-quality, evidence-backed information that authenticated users see, simply without the context of their own specific connected projects.

## Designing the Guest Experience

Designing for unauthenticated guests requires strict architectural boundaries around personalization. When a user is not signed in, Starboard's shared application shell gracefully degrades. Private list filters fail closed, and personalized controls—such as custom tags, saved collections, and the ability to star repositories—remain explicitly hidden.

However, the core utility of discovery remains entirely intact. Guests can leverage URL-shareable filter and sort states (managed via `nuqs`) to refine the public corpus. They can sort by fastest-growing repositories using the stored 30-day growth ordering, filter by detected tools, or search by specific languages and categories. We expose public shared lists at dedicated routes (`/lists/[slug]`), and these lists are server-side rendered, allowing guests to view curated collections of repositories without needing an account.

Crucially, we prioritized resilience in the guest experience. We specifically removed stale authentication-status guards from the guest content components to ensure that unauthenticated reads use the shared seeded corpus smoothly. Furthermore, if a visitor's browser privacy tools block generic client-side JSON API requests, the first result set is server-rendered directly into the document. This ensures that the guest feed remains visible and functional, avoiding a broken experience for privacy-conscious developers.

## Evidence-Backed Tool Intelligence

A key differentiator in open-source discovery is moving beyond generic trending lists to understand *how* a repository is built. Starboard implements Tool Intelligence, detecting tool, framework, and platform usage across over 10,000 repositories. Crucially, this intelligence is fully available to unauthenticated users.

When a guest visits a repository's detail page (the `/explore` route), they don't just see a readme and a star count. They see detected-tool evidence. This detection is backed by rigorous evidence gathering: reading package manifests, Software Bill of Materials (SBOMs), repository trees, and occasionally lower-confidence metadata inference.

Because evidence quality varies—for instance, finding a library in a `package.json` provides much higher certainty than parsing a topic tag—Starboard explicitly labels the source and confidence of its tool detections. We display an accuracy disclaimer directly in the product, acknowledging that while manifest and SBOM evidence is strong, inference from READMEs or topics is less certain, and ecosystems like C/C++ monorepos can vary significantly.

This transparency reflects one of our core product principles: prefer evidence and explainability over generic popularity rankings. By making this evidence visible before sign-in, developers can evaluate not just what a repository does, but what dependencies it brings with it.

## Search Capabilities and Fallbacks

Effective public discovery relies on robust, intuitive search. Starboard supports both full-text (lexical) and semantic search for the public corpus, accessible to any guest visitor.

The full-text search operates over repository names, descriptions, and topics using Cloudflare D1's FTS5 capabilities. This provides immediate, deterministic matching for specific, known queries.

For broader, concept-based discovery, we use semantic search backed by a shared knowledgebase Worker and Cloudflare Vectorize. The vector index (`starboard-repos`, using a 768-dimension cosine similarity model) allows users to find repositories that solve similar problems even if they don't share exact keywords. When shared RAG is enabled, relevance search uses the fleet knowledgebase Worker with synchronous ingest for new repositories, fetching README text to build comprehensive semantic documents.

When an unauthenticated user searches the Discover page, the system fuses these bounded semantic and lexical candidates. However, we planned for failure: if the shared RAG service is unavailable or local embeddings cannot be generated, the search honestly falls back to purely lexical results rather than failing entirely or displaying an error state. This resilience ensures that the public discovery surface remains operational and useful regardless of backend machine learning availability.

## The Boundary of Authentication

While the public discovery experience is rich and fully featured, there is a deliberate boundary where authentication becomes necessary to unlock Starboard's full potential. The primary catalyst for sign-in is *project-aware* discovery.

Starboard is fundamentally designed to connect a developer's specific GitHub projects to the open-source catalog. Guests can preview a cataloged public GitHub repository without sign-in, inspecting a read-only recommendation sample. However, uncataloged lookups and the ability to save connections require an authenticated GitHub session.

When a developer chooses to sign in via GitHub OAuth (using NextAuth v5), they unlock the ability to sync their personal starred repositories, categorize them with custom colored tags, and group them into named collections. More importantly, they can connect their own public GitHub repositories to receive tailored recommendations based on their project's specific metadata, tools, and topics.

Even at this boundary, Starboard strictly adheres to the principle of asking for the least access necessary. The initial project-connection boundary relies entirely on public GitHub repositories, utilizing the existing minimal OAuth permission. There is no broad scope requested for private repositories. No new production dependencies or broader GitHub OAuth scopes are required for the initial connected-project workflow.

Once connected, Starboard extracts evidence-backed needs from the project and searches the catalog to provide specific, deterministic recommendations. It classifies candidates into buckets—such as adopt/integrate, reference implementation, or architectural pattern—and explains exactly why a language, topic, or tool makes a repository a good fit. By deferring authentication until this personalized value can be delivered, we build trust and ensure developers only share their identity when they are ready to leverage project-aware intelligence.

## Next Action

Experience project-aware tool intelligence without the commitment of an immediate sign-in. Visit the [Starboard Discover](https://starboard.codevetter.com/discover) page to search the seeded repository catalog, filter by detected tools, and explore evidence-backed technical contexts completely anonymously.

## Source Notes

- **Product Constraints and Principles**: Supported by `PRODUCT.md` (e.g., "Keep discovery useful before sign-in and more relevant after connection", "Ask for the least GitHub access necessary", "Public repository discovery with search, language, tool, and growth filters").
- **Seeded Corpus and Discover Route**: Supported by `PROJECT_STATUS.md` ("guests still see the feed when a privacy tool blocks client-side JSON requests entirely", "unauthenticated reads use the shared seeded corpus", "5k+ seed walk has a hard per-run page bound", "GitHub search now retries transient network and 5xx failures with bounded exponential backoff").
- **Tool Intelligence**: Supported by `PROJECT_STATUS.md` ("Tool Intelligence: additive `repo_tools` index... bounded SBOM/tree/manifest-based detection with source/confidence labels", "accuracy disclaimer is shown in-product because manifest/SBOM evidence is stronger than README...").
- **Search Capabilities**: Supported by `PROJECT_STATUS.md` and `README.md` ("Shared-RAG integration... relevance search uses the fleet knowledgebase Worker", "relevance search fuses bounded semantic and lexical candidates and falls back honestly to lexical search", "Cloudflare Vectorize (starboard-repos, 768-d cosine)").
- **Authentication Boundary**: Supported by `PRODUCT.md` and `PROJECT_STATUS.md` ("The initial project-connection boundary is public GitHub repositories using the existing minimal OAuth permission", "Guests can preview a cataloged public GitHub repository without sign-in or a user-data write. Uncataloged lookups require the existing GitHub session token and preserve the repository through sign-in...").
- **Internal link suggestions**: `/discover` (Discover feed), `/explore/[...slug]` (Repo detail), `/lists/[slug]` (Shared lists). All referenced inline appropriately based on routes defined in `PROJECT_STATUS.md`.
