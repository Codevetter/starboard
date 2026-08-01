# Runbook: Embedding dimension drift

Starboard's repository vectors live in the `starboard-repos` Cloudflare
Vectorize index. The current contract is 768 dimensions with cosine similarity;
D1 stores only `repo_id` and `text_hash`.

## Symptom

- Vectorize rejects an upsert because its values do not match the index
  dimension.
- `generateEmbeddings()` reports a model response whose normalized vector is
  not `EMBEDDING_DIM=768`.

## Response

1. Stop embedding jobs; relational reads/writes can continue.
2. Confirm the model and `EMBEDDING_DIM` in `src/lib/embeddings.ts`.
3. If the model response is wrong, fix the generator and rerun the idempotent
   embedding job. Do not advance D1 hashes without a successful vector upsert.
4. If the intended dimension changed, create a replacement Vectorize index
   with the new dimension/metric, re-embed and validate it, then change the
   binding in an approval-gated deploy.
5. Retain the previous index through the observation window for rollback.

There is no automatic destructive self-heal. Dimension changes are deliberate
resource migrations because replacing an index affects every ANN query.

See [ADR-0009](../../architecture/decisions/0009-cloudflare-d1-vectorize.md).
