import { createReadStream, createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { extname } from 'node:path';
import { createInterface } from 'node:readline';

const sourcePath = process.argv[2];
const targetPath = process.argv[3];
if (!sourcePath || !targetPath) {
  throw new Error(
    'Usage: node scripts/convert-turso-vectors.mjs <source.jsonl> <vectorize.ndjson>'
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
  if (!rawLine.trim()) continue;
  const row = JSON.parse(rawLine);
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
