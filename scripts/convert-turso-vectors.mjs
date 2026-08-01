import { createReadStream, createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { extname } from 'node:path';
import { createInterface } from 'node:readline';

const sourcePath = process.argv[2];
const targetPath = process.argv[3];
if (!sourcePath || !targetPath) {
  throw new Error(
    'Usage: node scripts/convert-turso-vectors.mjs <source.jsonl|source.sql> <vectorize.ndjson>'
  );
}

const input = createInterface({ input: createReadStream(sourcePath), crlfDelay: Infinity });
const MAX_VECTORS_PER_FILE = 5_000;
const outputPaths = [];
let output;
let fileCount = 0;
let vectorsInFile = 0;
let count = 0;

function indexedPath(index) {
  if (index === 1) return targetPath;
  const extension = extname(targetPath);
  const stem = extension ? targetPath.slice(0, -extension.length) : targetPath;
  return `${stem}.${String(index).padStart(4, '0')}${extension}`;
}

function openOutput() {
  fileCount += 1;
  vectorsInFile = 0;
  const path = indexedPath(fileCount);
  outputPaths.push(path);
  output = createWriteStream(path, { flags: 'wx' });
}

async function closeOutput() {
  if (!output) return;
  output.end();
  await once(output, 'finish');
}

openOutput();

for await (const rawLine of input) {
  const line = rawLine.trim();
  if (!line) continue;
  let row;
  if (line.startsWith('{')) {
    row = JSON.parse(line);
  } else {
    if (!/^INSERT\s+INTO\s+["'`]?repo_embeddings/i.test(line)) continue;
    const values = line.match(
      /^INSERT\s+INTO\s+["'`]?repo_embeddings["'`]?\s+VALUES\(\s*(-?\d+)\s*,\s*X'([0-9A-Fa-f]+)'\s*,/i
    );
    if (!values) throw new Error(`Invalid repo_embeddings dump record at input line ${count + 1}`);
    const buffer = Buffer.from(values[2], 'hex');
    if (buffer.length !== 768 * Float32Array.BYTES_PER_ELEMENT) {
      throw new Error(`Invalid vector blob length at input line ${count + 1}`);
    }
    row = {
      repo_id: Number(values[1]),
      embedding: Array.from({ length: 768 }, (_, index) => buffer.readFloatLE(index * 4)),
    };
  }
  const repoId = Number(row.repo_id);
  const values = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
  if (!Number.isSafeInteger(repoId) || !Array.isArray(values) || values.length !== 768) {
    throw new Error(`Invalid vector record at input line ${count + 1}`);
  }
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error(`Non-finite vector value at input line ${count + 1}`);
  }
  if (vectorsInFile >= MAX_VECTORS_PER_FILE) {
    await closeOutput();
    openOutput();
  }
  const vector = JSON.stringify({ id: String(repoId), values, metadata: { repoId } });
  if (!output.write(`${vector}\n`)) await once(output, 'drain');
  count += 1;
  vectorsInFile += 1;
}

await closeOutput();
process.stdout.write(
  `${JSON.stringify({ sourcePath, outputPaths, vectors: count, maxVectorsPerFile: MAX_VECTORS_PER_FILE })}\n`
);
