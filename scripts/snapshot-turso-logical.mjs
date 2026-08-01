import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const databaseName = process.argv.slice(2).find((argument) => argument !== '--');
if (!databaseName) {
  throw new Error('Usage: node scripts/snapshot-turso-logical.mjs <turso-database-name>');
}

const TABLES = [
  ['users', ['id', 'username', 'avatar_url', 'email', 'created_at'], ['id']],
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
      'archived',
      'topics',
      'repo_created_at',
      'repo_updated_at',
    ],
    ['id'],
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
      'is_public',
      'slug',
      'description',
      'created_at',
    ],
    ['id'],
  ],
  [
    'user_repos',
    ['user_id', 'repo_id', 'list_id', 'tags', 'notes', 'is_starred', 'is_saved', 'starred_at'],
    ['user_id', 'repo_id'],
  ],
  [
    'user_repo_lists',
    ['user_id', 'repo_id', 'list_id', 'created_at'],
    ['user_id', 'repo_id', 'list_id'],
  ],
  ['comments', ['id', 'repo_id', 'user_id', 'body', 'created_at'], ['id']],
  ['likes', ['user_id', 'repo_id', 'created_at'], ['user_id', 'repo_id']],
  ['comment_votes', ['user_id', 'comment_id', 'value'], ['user_id', 'comment_id']],
  ['repo_embeddings', ['repo_id', 'text_hash'], ['repo_id']],
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
    ['repo_id'],
  ],
  [
    'repo_star_snapshots',
    ['repo_id', 'stargazers_count', 'captured_at'],
    ['repo_id', 'captured_at'],
  ],
  [
    'repo_threshold_events',
    ['repo_id', 'threshold', 'previous_stars', 'current_stars', 'crossed_at'],
    ['repo_id', 'threshold'],
  ],
  ['seed_cursor', ['id', 'next_max_stars', 'next_page', 'updated_at'], ['id']],
  [
    'repo_tools',
    ['repo_id', 'tool_key', 'tool_name', 'category', 'confidence', 'sources', 'detected_at'],
    ['repo_id', 'tool_key'],
  ],
  [
    'repo_tool_enrichment_state',
    ['repo_id', 'source_hash', 'status', 'error', 'processed_at'],
    ['repo_id'],
  ],
  ['user_alert_preferences', ['user_id', 'rules', 'updated_at'], ['user_id']],
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
    ['id'],
  ],
];

function identifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function queryTable(name, columns, orderBy) {
  const query = [
    "SELECT printf('%08X', length(row_json)) || hex(row_json) AS framed_row_hex",
    'FROM (',
    `SELECT CAST(json_array(${columns.map(identifier).join(', ')}) AS BLOB) AS row_json`,
    `FROM ${identifier(name)}`,
    `ORDER BY ${orderBy.map(identifier).join(', ')}`,
    ');',
  ].join(' ');

  return new Promise((resolve, reject) => {
    const child = spawn('turso', ['db', 'shell', databaseName, query], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const hash = createHash('sha256');
    let count = 0;
    let stderr = '';
    let framedHex = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-2_000);
    });

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', (rawLine) => {
      const line = rawLine.trim();
      if (!line || line.replaceAll(/\s+/g, ' ') === 'FRAMED ROW HEX') return;
      if (/^[\u2800-\u28FF]\s+Connect(?:ing|ed) to database/.test(line)) return;
      if (!/^[0-9A-F]+$/.test(line) || line.length % 2 !== 0) {
        child.kill('SIGTERM');
        reject(
          new Error(
            `Unexpected Turso output while snapshotting ${name} (length=${line.length}, prefixCodes=${[
              ...line.slice(0, 16),
            ]
              .map((character) => character.codePointAt(0))
              .join(',')})`
          )
        );
        return;
      }
      framedHex += line;
      while (framedHex.length >= 8) {
        const payloadBytes = Number.parseInt(framedHex.slice(0, 8), 16);
        const frameLength = 8 + payloadBytes * 2;
        if (!Number.isSafeInteger(payloadBytes) || framedHex.length < frameLength) break;
        const payload = framedHex.slice(8, frameLength);
        hash.update(payload);
        hash.update('\n');
        count += 1;
        framedHex = framedHex.slice(frameLength);
      }
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Turso snapshot failed for ${name}: ${stderr.trim() || `exit ${code}`}`));
        return;
      }
      if (framedHex) {
        reject(new Error(`Incomplete framed Turso output while snapshotting ${name}`));
        return;
      }
      resolve({ table: name, rows: count, sha256: hash.digest('hex') });
    });
  });
}

const startedAt = Date.now();
const tables = [];
const databaseHash = createHash('sha256');
for (const [name, columns, orderBy] of TABLES) {
  const result = await queryTable(name, columns, orderBy);
  tables.push(result);
  databaseHash.update(`${result.table}\0${result.rows}\0${result.sha256}\n`);
}

process.stdout.write(
  `${JSON.stringify(
    {
      databaseName,
      sha256: databaseHash.digest('hex'),
      rows: tables.reduce((total, table) => total + table.rows, 0),
      durationMs: Date.now() - startedAt,
      tables,
    },
    null,
    2
  )}\n`
);
