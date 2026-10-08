import { pathToFileURL } from 'node:url';

export async function smokeEmbeddingAdmission({ limit, token, fetchImpl = fetch }) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) {
    throw new Error('Embedding smoke limit must be an integer from 0 to 100.');
  }
  if (limit === 0) return { skipped: true };
  if (!token) throw new Error('Operator authentication is required.');
  const endpoint = 'https://starboard.codevetter.com/api/internal/embed-pending';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const demand = await fetchImpl(`${endpoint}?mode=demand&limit=${limit}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!demand.ok) throw new Error(`Embedding demand HTTP ${demand.status}`);
  const before = await demand.json();
  if (!Number.isSafeInteger(before.pending) || before.pending < 0)
    throw new Error('Invalid demand receipt.');
  if (before.pending === 0) return { pendingBefore: 0, embedded: 0, pendingAfter: 0 };
  // Never retry a mutation with an ambiguous result. The shared ledger retains
  // its reservation and the next run reconciles D1 hashes before trying again.
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ limit }),
    signal: AbortSignal.timeout(900_000),
  });
  if (!response.ok) throw new Error(`Guarded embedding HTTP ${response.status}`);
  const result = await response.json();
  if (!Number.isSafeInteger(result.embedded) || result.embedded < 1 || result.embedded > limit) {
    throw new Error('Invalid embedding receipt.');
  }
  const after = await fetchImpl(`${endpoint}?mode=demand&limit=${limit}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!after.ok) throw new Error(`Embedding demand readback HTTP ${after.status}`);
  const readback = await after.json();
  if (!Number.isSafeInteger(readback.pending) || readback.pending < 0)
    throw new Error('Invalid demand readback.');
  return {
    pendingBefore: before.pending,
    embedded: result.embedded,
    pendingAfter: readback.pending,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  smokeEmbeddingAdmission({
    limit: Number(process.env.EMBED_LIMIT ?? 0),
    token: process.env.STARBOARD_OPERATOR_TOKEN,
  })
    .then((receipt) => console.log(JSON.stringify(receipt)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
