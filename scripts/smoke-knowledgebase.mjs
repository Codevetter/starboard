#!/usr/bin/env node
/**
 * Smoke Starboard -> knowledgebase wiring.
 *
 * Full product smoke needs a real signed-in Starboard session cookie:
 *
 *   STARBOARD_SESSION_COOKIE='authjs.session-token=...' pnpm smoke:knowledgebase -- --sync
 */

const baseUrl =
  readArg('--base-url') ||
  process.env.STARBOARD_BASE_URL ||
  'https://starboard.sarthakagrawal927.workers.dev';
const cookie = process.env.STARBOARD_SESSION_COOKIE || '';
const query = readArg('--query') || process.env.STARBOARD_SMOKE_QUERY || 'typescript testing';
const shouldSync = process.argv.includes('--sync') || process.env.STARBOARD_SMOKE_SYNC === '1';
const failures = [];

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.replace(/\/+$/, '') : '';
}

async function request(path, init = {}) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body, text };
}

async function check(name, fn) {
  try {
    const result = await fn();
    console.log(`ok  ${name}${result ? ` ${result}` : ''}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`fail ${name}: ${message}`);
    failures.push(name);
  }
}

await check('public app responds', async () => {
  const { res, text } = await request('/');
  if (!res.ok) throw new Error(`${res.status}`);
  if (!text.includes('Starboard')) throw new Error('landing marker missing');
});

await check('stars API requires auth', async () => {
  const res = await fetch(
    `${baseUrl.replace(/\/+$/, '')}/api/stars?q=${encodeURIComponent(query)}&sort=relevance`
  );
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

if (!cookie) {
  console.log('skip authenticated Starboard RAG flow (set STARBOARD_SESSION_COOKIE)');
} else {
  if (shouldSync) {
    await check('sync stars and ingest knowledgebase documents', async () => {
      const { res, body } = await request('/api/stars/sync', { method: 'POST', body: '{}' });
      if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
      return JSON.stringify({
        added: body?.added?.length ?? 0,
        ragIngested: body?.ragIngested ?? 0,
        totalRepos: body?.totalRepos ?? 0,
      });
    });
  } else {
    console.log('skip sync mutation (pass --sync or STARBOARD_SMOKE_SYNC=1)');
  }

  await check('semantic relevance search returns authenticated response', async () => {
    const path = `/api/stars?q=${encodeURIComponent(query)}&sort=relevance&limit=10`;
    const { res, body } = await request(path);
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
    if (!Array.isArray(body?.repos ?? body)) throw new Error('missing repo list');
    return JSON.stringify({ query });
  });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed`);
  process.exit(1);
}

console.log('\nStarboard knowledgebase smoke complete');
