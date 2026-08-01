import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Turso to D1 transfer tooling', () => {
  it('keeps relational rows, strips shadow tables, and removes vector blobs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'starboard-d1-dump-'));
    const source = join(directory, 'source.sql');
    const target = join(directory, 'target.sql');
    writeFileSync(
      source,
      [
        'CREATE TABLE repos (id INTEGER PRIMARY KEY);',
        `INSERT INTO "repos" VALUES(1,'one','fleet/one','fleet','avatar','url','description','TypeScript',1,0,'[]',NULL,NULL);`,
        `INSERT INTO "repo_embeddings" VALUES(1,X'0102','hash');`,
        `INSERT INTO "repos_fts_data" VALUES(1,X'0102');`,
      ].join('\n')
    );

    execFileSync(process.execPath, ['scripts/convert-turso-dump-to-d1.mjs', source, target], {
      cwd: process.cwd(),
    });

    const converted = readFileSync(target, 'utf-8');
    expect(converted).toContain('INSERT INTO "repos" VALUES');
    expect(converted).toContain(
      "INSERT INTO repo_embeddings (repo_id, text_hash) VALUES (1, 'hash');"
    );
    expect(converted).not.toContain('repos_fts_data');
    expect(converted).not.toContain("X'0102'");
    expect(converted).toContain('PRAGMA foreign_key_check;');
  });

  it('converts extracted vectors to validated Vectorize NDJSON', () => {
    const directory = mkdtempSync(join(tmpdir(), 'starboard-vectorize-'));
    const source = join(directory, 'source.jsonl');
    const target = join(directory, 'target.ndjson');
    writeFileSync(
      source,
      `${JSON.stringify({ repo_id: 7, embedding: Array.from({ length: 768 }, () => 0.1) })}\n`
    );

    execFileSync(process.execPath, ['scripts/convert-turso-vectors.mjs', source, target], {
      cwd: process.cwd(),
    });

    const vector = JSON.parse(readFileSync(target, 'utf-8'));
    expect(vector.id).toBe('7');
    expect(vector.values).toHaveLength(768);
    expect(vector.metadata).toEqual({ repoId: 7 });
  });

  it('caps Vectorize transfer files at the HTTP API batch limit', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/convert-turso-vectors.mjs'), 'utf-8');
    expect(source).toContain('MAX_VECTORS_PER_FILE = 5_000');
    expect(source).toContain('vectorsInFile >= MAX_VECTORS_PER_FILE');
  });
});
