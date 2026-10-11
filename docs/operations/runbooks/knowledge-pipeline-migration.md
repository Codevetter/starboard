# Knowledge pipeline migration

## Status and scope

The implementation is prepared behind `STARBOARD_KNOWLEDGE_PIPELINE=knowledgebase`.
It is not a production cutover. Keep the flag unset until reconciliation succeeds.
Meme Lab is outside this migration.

Knowledgebase owns repository source snapshots, enrichment, embedding storage,
lexical and semantic retrieval, explicit needs, capability profiles, and decisions.
Starboard retains accounts, catalog IDs, project connections, saved lists, and
presentation mirrors of derived knowledge. Existing stores are retained for rollback.

D1 mirror writes follow Knowledgebase publication. A failed publication must not
checkpoint fresh hashes or silently replace the service with a local model.
Legacy knowledge copied from D1 is labelled `legacy_unvalidated`; it is not promoted
into the evidence used for current recommendations.
After cutover, saved draft and reviewed reports must carry `knowledgebase-v1` before
they can appear in project intelligence. Legacy reports remain available for rollback.

## Service prerequisites

Before changing runtime configuration:

1. Review and deploy the Knowledgebase shared-pipeline branch.
2. Apply Knowledgebase migration `0011_catalog_snapshots_fts_decisions.sql`.
3. Verify account-wide embedding and Vectorize capacity through the shared ledger.
4. Create a dedicated public catalog index, with BGE base and 768 dimensions.
5. Create a fresh private personal-library index. Keep the previous index intact.
6. Configure Vectorize metadata indexes for `kind`, `visibility`, `repo_id`, and
   `user_id`. Metadata indexes must exist before vector publication.
7. Configure Starboard's existing service binding/key for that tenant, plus
   `STARBOARD_CATALOG_INDEX_ID` and `STARBOARD_RAG_INDEX_ID` for the two indexes.

The service authenticates every index operation. A `visibility` field does not
create an unauthenticated public data endpoint. Personal membership uses the private
index and a user scope; final Library hydration also checks Starboard's membership.

The storage reservation must validate current month, verified baseline, exact
requested dimensions, and stored-capacity headroom before inference or publication.
An unavailable ledger or exhausted allocation blocks the write. Do not remove the
guard to complete a migration.

## Plan and bounded import

The operator job uses the existing authenticated D1 REST adapter. Supply the usual
operator configuration through the established secure mechanism. Do not place keys
in arguments, manifests, or committed files.

```bash
KNOWLEDGE_MIGRATION_DERIVED=true pnpm db:knowledge-migrate plan
```

`plan` reads D1 and writes a local ignored manifest. It does not call inference or
write Knowledgebase. The default catalog batch is 50 repositories; the hard cap is
250. Catalog membership comes from every existing `repos` ID, without a popularity
floor or outside-list discovery.

After deployment and migration authorization:

```bash
KNOWLEDGE_MIGRATION_LIMIT=50 pnpm db:knowledge-migrate apply
KNOWLEDGE_MIGRATION_LIMIT=50 KNOWLEDGE_MIGRATION_RESUME=true pnpm db:knowledge-migrate apply
```

Repeat bounded batches until the cursor reaches the end. Source collection pins
GitHub revisions and records complete, partial, or unavailable coverage. Partial
coverage is retained explicitly; it is not evidence that every repository file was
inspected. A failed or partial refresh cannot overwrite an earlier complete snapshot.

The source revision refresh runs independently of the metadata embedding hash.
This catches README and product-document changes that leave GitHub descriptions
unchanged. Ingest uses stable external IDs and idempotent replacements.

Import derived snapshots and personal-library documents once catalog publication
has completed:

```bash
KNOWLEDGE_MIGRATION_DERIVED=true pnpm db:knowledge-migrate apply
```

The fixed table allowlist includes metadata, tools, capability cards, fingerprints,
needs, candidate pools, draft/reviewed reports, and review requests. Accounts,
collections, tags, notes, and project ownership are excluded from that export.
Personal documents are copied into the private index with canonical source pointers.

Manifests live under `.fleet-local/knowledge-migration/manifest-<mode>.json`.
They contain repository IDs, revisions, content hashes, statuses, counts, and cursors.
They contain no keys or source bodies. A resumed run rejects changed catalog
membership. Retry a failed repository with `KNOWLEDGE_MIGRATION_AFTER=<id-minus-one>`
and `KNOWLEDGE_MIGRATION_LIMIT=1`; do not discard failures when advancing the cursor.

## Reconciliation and cutover

```bash
KNOWLEDGE_MIGRATION_LIMIT=50 pnpm db:knowledge-migrate reconcile
KNOWLEDGE_MIGRATION_RESUME=true pnpm db:knowledge-migrate reconcile
KNOWLEDGE_MIGRATION_DERIVED=true pnpm db:knowledge-migrate reconcile
```

Walk the complete catalog. Require each current repository ID, exact published source
content, pinned revision/coverage, and a profile referencing the current document.
Review partial coverage separately. Compare derived counts/content and private
library source pointers. Resolve failed, missing, and stale entries before cutover.
The job never sets a runtime flag or deploys an application.

After reconciliation, deploy Starboard with the knowledge pipeline flag enabled.
Discover, Library, Similar, project recommendations, and need-driven decisions use
Knowledgebase. Similar uses strict cosine queries; hybrid ranks are never interpreted
as cosine similarity. D1 hydration still limits results to catalog IDs and the
current user's saved/starred scope.

For freshness, run bounded `apply` refresh batches regularly and refresh private
library mirrors after the catalog sweep. Existing sync handles a bounded foreground
subset; a full import is completed by the operator job. Configure scheduling only
through a separately reviewed production change.

## Model comparison

Projects provides **Compare models** through an authenticated POST endpoint.
The service freezes source IDs, candidate IDs, excerpts, and questions once, then
submits the same input to Free AI `auto` and optional `typesafe/jev`.

Jev stays disabled until its paid use is explicitly approved and enabled in
Knowledgebase. A disabled/error result is shown as such. It is never replaced with
the current model's output. See the [official Jev contract](https://developers.cloudflare.com/ai/models/typesafe/jev/).

Results record actual model/provider when reported, latency, usage, source
quotations, and the frozen input hash. Evidence packing reports truncation coverage.
Candidate order is retrieval order, not a model relevance score. Agreement compares
verdicts; it does not measure recommendation accuracy or identify a winning model.

No model comparison has been run for this migration yet. A quality comparison
requires human labels on held-out projects and unsupported/negative cases before
claiming improved recommendations.

## Rollback

Unset `STARBOARD_KNOWLEDGE_PIPELINE` and redeploy the previous Starboard path.
Keep original D1 knowledge tables, the original personal RAG index, and Starboard's
repository Vectorize index throughout dogfooding. The migration deletes none of them.
Do not retire old storage until production parity and recommendation quality have
been demonstrated and retirement is separately authorized.
