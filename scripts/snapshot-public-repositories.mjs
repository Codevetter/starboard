import { writeFile } from 'node:fs/promises';
import { isPublishableRepository } from '../src/lib/public-repository-admission.ts';

// Read the existing guest API only. No OAuth, user libraries, D1 operator
// credentials, AI or per-repository GitHub requests are involved.
const source = 'https://starboard.codevetter.com/api/discover';
const rows = new Map();
let sourceTotal;
async function readPage(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (response.ok) return response.json();
    if (response.status < 500 && response.status !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error('Public catalog page unavailable; snapshot not written');
}
for (let offset = 0; sourceTotal === undefined || offset < sourceTotal; offset += 200) {
  const url = new URL(source);
  url.search = new URLSearchParams({ limit: '200', offset: String(offset), sort: 'name' });
  const data = await readPage(url);
  sourceTotal ??= data.total;
  if (
    !Number.isSafeInteger(data.total) ||
    data.total !== sourceTotal ||
    !Array.isArray(data.repos)
  ) {
    throw new Error('Public catalog changed or returned an invalid page; snapshot not written');
  }
  for (const row of data.repos) {
    if (rows.has(row.id)) throw new Error('Duplicate repository; snapshot not written');
    rows.set(row.id, { ...row, owner_login: row.owner?.login });
  }
  console.log(`${Math.min(offset + 200, sourceTotal)}/${sourceTotal}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
}
if (rows.size !== sourceTotal) throw new Error('Incomplete public catalog; snapshot not written');
const repositories = [...rows.values()]
  .filter(isPublishableRepository)
  .map((row) => [row.id, row.full_name])
  .sort((a, b) => a[1].localeCompare(b[1], 'en'));
if (!repositories.length) throw new Error('Empty publication snapshot');
const snapshot = {
  source,
  capturedAt: new Date().toISOString(),
  sourceTotal,
  qualification:
    'Guest Discover export; popular catalog only (at least 5000 stars), exact GitHub identity and description of at least 30 characters. Historical D1 rows have no visibility flag; this records already-public catalog provenance, not a fresh GitHub visibility check.',
  repositories,
};
await writeFile(
  new URL('../src/data/public-repository-identities.json', import.meta.url),
  `${JSON.stringify(snapshot)}\n`
);
console.log(`Qualified ${repositories.length}/${sourceTotal} public catalog identities`);
