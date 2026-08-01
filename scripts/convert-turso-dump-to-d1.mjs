import { createReadStream, createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { createInterface } from 'node:readline';

const sourcePath = process.argv[2];
const targetPath = process.argv[3];
if (!sourcePath || !targetPath) {
  throw new Error('Usage: node scripts/convert-turso-dump-to-d1.mjs <source.sql> <target.sql>');
}

const DATA_TABLES = new Set([
  'users',
  'repos',
  'user_lists',
  'user_repos',
  'user_repo_lists',
  'comments',
  'likes',
  'comment_votes',
  'repo_ai_metadata',
  'repo_star_snapshots',
  'repo_threshold_events',
  'repo_tools',
  'repo_tool_enrichment_state',
  'user_alert_preferences',
  'insight_reports',
]);

const input = createInterface({ input: createReadStream(sourcePath), crlfDelay: Infinity });
const output = createWriteStream(targetPath, { flags: 'wx' });
const counts = new Map();

function write(line) {
  if (!output.write(`${line}\n`)) return once(output, 'drain');
  return Promise.resolve();
}

await write('PRAGMA defer_foreign_keys = true;');

for await (const rawLine of input) {
  const line = rawLine.trim();
  if (!/^INSERT\s+/i.test(line)) continue;
  if (!line.endsWith(';')) {
    throw new Error('Expected one complete INSERT statement per dump line');
  }

  const tableMatch = line.match(/^INSERT\s+INTO\s+["'`]?([a-zA-Z0-9_]+)["'`]?/i);
  if (!tableMatch) throw new Error(`Could not identify INSERT target: ${line.slice(0, 120)}`);
  const table = tableMatch[1];

  if (table === 'repo_embeddings') {
    const values = line.match(
      /^INSERT\s+INTO\s+["'`]?repo_embeddings["'`]?\s+VALUES\(\s*(-?\d+)\s*,[\s\S]*,\s*('(?:''|[^'])*')\s*\);$/i
    );
    if (!values) {
      throw new Error('Could not extract repo_id/text_hash from repo_embeddings INSERT');
    }
    await write(
      `INSERT INTO repo_embeddings (repo_id, text_hash) VALUES (${values[1]}, ${values[2]});`
    );
    counts.set(table, (counts.get(table) ?? 0) + 1);
    continue;
  }

  if (!DATA_TABLES.has(table)) continue;
  await write(line);
  counts.set(table, (counts.get(table) ?? 0) + 1);
}

await write('PRAGMA foreign_key_check;');
output.end();
await once(output, 'finish');

const summary = Object.fromEntries(
  [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
);
process.stdout.write(
  `${JSON.stringify({ sourcePath, targetPath, rowStatements: summary }, null, 2)}\n`
);
