import { createReadStream, createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { extname } from 'node:path';
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
  'seed_cursor',
  'migration_markers',
  'repo_tools',
  'repo_tool_enrichment_state',
  'user_alert_preferences',
  'insight_reports',
]);
const SOURCE_COLUMNS = new Map([
  ['users', ['id', 'username', 'avatar_url', 'created_at', 'email']],
  [
    'repos',
    [
      'id',
      'name',
      'full_name',
      'owner_login',
      'owner_avatar',
      'html_url',
      'description',
      'language',
      'stargazers_count',
      'topics',
      'repo_created_at',
      'repo_updated_at',
      'archived',
    ],
  ],
  [
    'user_lists',
    [
      'id',
      'user_id',
      'name',
      'color',
      'icon',
      'position',
      'created_at',
      'is_public',
      'slug',
      'description',
    ],
  ],
  [
    'user_repos',
    ['user_id', 'repo_id', 'list_id', 'tags', 'notes', 'starred_at', 'is_starred', 'is_saved'],
  ],
  ['user_repo_lists', ['user_id', 'repo_id', 'list_id', 'created_at']],
  ['comments', ['id', 'repo_id', 'user_id', 'body', 'created_at']],
  ['likes', ['user_id', 'repo_id', 'created_at']],
  ['comment_votes', ['user_id', 'comment_id', 'value']],
  [
    'repo_ai_metadata',
    [
      'repo_id',
      'summary',
      'category',
      'subcategories',
      'use_cases',
      'keywords',
      'source_hash',
      'model',
      'created_at',
      'updated_at',
    ],
  ],
  ['repo_star_snapshots', ['repo_id', 'stargazers_count', 'captured_at']],
  [
    'repo_threshold_events',
    ['repo_id', 'threshold', 'previous_stars', 'current_stars', 'crossed_at'],
  ],
  ['seed_cursor', ['id', 'next_max_stars', 'next_page', 'updated_at']],
  ['migration_markers', ['key', 'applied_at']],
  [
    'repo_tools',
    ['repo_id', 'tool_key', 'tool_name', 'category', 'confidence', 'sources', 'detected_at'],
  ],
  ['repo_tool_enrichment_state', ['repo_id', 'source_hash', 'status', 'error', 'processed_at']],
  ['user_alert_preferences', ['user_id', 'rules', 'updated_at']],
  [
    'insight_reports',
    [
      'id',
      'user_id',
      'slug',
      'report_type',
      'title',
      'snapshot_at',
      'payload',
      'redact_private',
      'is_public',
      'created_at',
    ],
  ],
]);

const input = createInterface({ input: createReadStream(sourcePath), crlfDelay: Infinity });
const counts = new Map();
let statement = '';
const MAX_BYTES_PER_FILE = 512 * 1024;
const MAX_STATEMENTS_PER_FILE = 5_000;
const MAX_TEXT_CHUNK_BYTES = 32 * 1024;
const outputPaths = [];
let output;
let fileCount = 0;
let statementsInFile = 0;
let bytesInFile = 0;
let activeTable;

function indexedPath(index) {
  if (index === 1) return targetPath;
  const extension = extname(targetPath);
  const stem = extension ? targetPath.slice(0, -extension.length) : targetPath;
  return `${stem}.${String(index).padStart(4, '0')}${extension}`;
}

function openOutput() {
  fileCount += 1;
  statementsInFile = 0;
  activeTable = undefined;
  const path = indexedPath(fileCount);
  outputPaths.push(path);
  output = createWriteStream(path, { flags: 'wx' });
  const header = 'PRAGMA defer_foreign_keys = true;\n';
  output.write(header);
  bytesInFile = Buffer.byteLength(header);
}

async function closeOutput() {
  if (!output) return;
  output.end();
  await once(output, 'finish');
}

async function writeStatement(line, table) {
  const serialized = `${line}\n`;
  const bytes = Buffer.byteLength(serialized);
  if (
    statementsInFile > 0 &&
    (table !== activeTable ||
      statementsInFile >= MAX_STATEMENTS_PER_FILE ||
      bytesInFile + bytes > MAX_BYTES_PER_FILE)
  ) {
    await closeOutput();
    openOutput();
  }
  activeTable = table;
  if (!output.write(serialized)) await once(output, 'drain');
  statementsInFile += 1;
  bytesInFile += bytes;
}

openOutput();

function makeReplaceSafe(line, table) {
  if (table !== 'seed_cursor' && table !== 'migration_markers') return line;
  return line.replace(/^INSERT\s+INTO/i, 'INSERT OR REPLACE INTO');
}

function addSourceColumns(line, table) {
  const columns = SOURCE_COLUMNS.get(table);
  if (!columns) throw new Error(`Missing source column order for ${table}`);
  const columnList = columns.map((column) => `"${column}"`).join(', ');
  return line.replace(
    new RegExp(`^INSERT\\s+INTO\\s+["'\\x60]?${table}["'\\x60]?\\s+VALUES`, 'i'),
    `INSERT INTO "${table}" (${columnList}) VALUES`
  );
}

function splitSqlValues(statement) {
  const match = statement.match(/^(INSERT\s+INTO\s+[\s\S]+?\s+VALUES\()([\s\S]*)(\);)$/i);
  if (!match) throw new Error('Could not parse oversized INSERT statement');
  const values = [];
  let token = '';
  let quoted = false;
  for (let index = 0; index < match[2].length; index += 1) {
    const character = match[2][index];
    if (character === "'") {
      token += character;
      if (quoted && match[2][index + 1] === "'") {
        token += match[2][index + 1];
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(token.trim());
      token = '';
    } else {
      token += character;
    }
  }
  if (quoted) throw new Error('Unterminated SQL string in oversized INSERT statement');
  values.push(token.trim());
  return { prefix: match[1], values, suffix: match[3] };
}

function decodeSqlString(literal) {
  if (!literal.startsWith("'") || !literal.endsWith("'")) {
    throw new Error('Expected a SQL string literal in oversized repository description');
  }
  return literal.slice(1, -1).replaceAll("''", "'");
}

function chunkUtf8(value, maxBytes) {
  const chunks = [];
  let chunk = '';
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character);
    if (bytes + characterBytes > maxBytes && chunk) {
      chunks.push(chunk);
      chunk = '';
      bytes = 0;
    }
    chunk += character;
    bytes += characterBytes;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function expandLargeRepoInsert(line) {
  if (Buffer.byteLength(line) < 96 * 1024) return [line];
  const parsed = splitSqlValues(line);
  if (parsed.values.length !== 13 || !/^-?\d+$/.test(parsed.values[0])) {
    throw new Error('Unexpected oversized repos INSERT shape');
  }
  const description = decodeSqlString(parsed.values[6]);
  parsed.values[6] = "''";
  const statements = [`${parsed.prefix}${parsed.values.join(',')}${parsed.suffix}`];
  for (const chunk of chunkUtf8(description, MAX_TEXT_CHUNK_BYTES)) {
    statements.push(
      `UPDATE repos SET description = description || CAST(X'${Buffer.from(chunk).toString('hex')}' AS TEXT) WHERE id = ${parsed.values[0]};`
    );
  }
  return statements;
}

async function convertInsert(sql) {
  const line = sql.trim();

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
    await writeStatement(
      `INSERT INTO repo_embeddings (repo_id, text_hash) VALUES (${values[1]}, ${values[2]});`,
      table
    );
    counts.set(table, (counts.get(table) ?? 0) + 1);
    return;
  }

  if (!DATA_TABLES.has(table)) return;
  const mapped = addSourceColumns(line, table);
  const statements = table === 'repos' ? expandLargeRepoInsert(mapped) : [mapped];
  for (const converted of statements) {
    await writeStatement(makeReplaceSafe(converted, table), table);
  }
  counts.set(table, (counts.get(table) ?? 0) + 1);
}

for await (const rawLine of input) {
  const line = rawLine.trim();
  if (!statement) {
    if (!/^INSERT\s+/i.test(line)) continue;
    statement = rawLine;
  } else {
    statement += `\n${rawLine}`;
  }

  // Turso's SQLite-compatible dump can split INSERT statements across lines,
  // notably for FTS metadata. Dumped INSERT statements terminate on a line
  // ending in a semicolon, so accumulate before classifying the target table.
  if (!/;\s*$/.test(line)) continue;
  await convertInsert(statement);
  statement = '';
}

if (statement) throw new Error('Source dump ended with an incomplete INSERT statement');

await writeStatement('PRAGMA foreign_key_check;', '__integrity__');
await closeOutput();

const summary = Object.fromEntries(
  [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
);
process.stdout.write(
  `${JSON.stringify(
    {
      sourcePath,
      outputPaths,
      rowStatements: summary,
      maxBytesPerFile: MAX_BYTES_PER_FILE,
      maxStatementsPerFile: MAX_STATEMENTS_PER_FILE,
    },
    null,
    2
  )}\n`
);
