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
        `INSERT INTO "repos" VALUES(1,'one','fleet/one','fleet','avatar','url','description','TypeScript',1,'[]',NULL,NULL,0);`,
        `INSERT INTO "repo_embeddings" VALUES(1,X'0102','hash');`,
        'INSERT INTO "sqlite_schema" VALUES(',
        "  'table',",
        "  'ignored',",
        "  'ignored',",
        '  0,',
        "  'CREATE TABLE ignored (id INTEGER)'",
        ');',
        `INSERT INTO "repos_fts_data" VALUES(1,X'0102');`,
      ].join('\n')
    );

    const summary = JSON.parse(
      execFileSync(process.execPath, ['scripts/convert-turso-dump-to-d1.mjs', source, target], {
        cwd: process.cwd(),
        encoding: 'utf8',
      })
    );

    const converted = summary.outputPaths
      .map((outputPath: string) => readFileSync(outputPath, 'utf-8'))
      .join('\n');
    expect(converted).toContain('INSERT INTO "repos" ("id"');
    expect(converted).toContain(
      "INSERT INTO repo_embeddings (repo_id, text_hash) VALUES (1, 'hash');"
    );
    expect(converted).not.toContain('repos_fts_data');
    expect(converted).not.toContain('CREATE TABLE ignored');
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

  it('converts float32 vector blobs directly from a Turso SQL dump', () => {
    const directory = mkdtempSync(join(tmpdir(), 'starboard-vector-dump-'));
    const source = join(directory, 'source.sql');
    const target = join(directory, 'target.ndjson');
    const embedding = Buffer.alloc(768 * Float32Array.BYTES_PER_ELEMENT);
    for (let index = 0; index < 768; index += 1) embedding.writeFloatLE(0.1, index * 4);
    writeFileSync(
      source,
      `INSERT INTO "repo_embeddings" VALUES(7,X'${embedding.toString('hex')}','hash');\n`
    );

    execFileSync(process.execPath, ['scripts/convert-turso-vectors.mjs', source, target], {
      cwd: process.cwd(),
    });

    const vector = JSON.parse(readFileSync(target, 'utf-8'));
    expect(vector.id).toBe('7');
    expect(vector.values).toHaveLength(768);
    expect(vector.values[0]).toBeCloseTo(0.1);
  });

  it('splits oversized repository descriptions below D1 statement limits', () => {
    const directory = mkdtempSync(join(tmpdir(), 'starboard-large-description-'));
    const source = join(directory, 'source.sql');
    const target = join(directory, 'target.sql');
    const description = 'x'.repeat(100_000);
    writeFileSync(
      source,
      `INSERT INTO "repos" VALUES(1,'one','fleet/one','fleet','avatar','url','${description}','TypeScript',1,'[]',NULL,NULL,0);\n`
    );

    const summary = JSON.parse(
      execFileSync(process.execPath, ['scripts/convert-turso-dump-to-d1.mjs', source, target], {
        cwd: process.cwd(),
        encoding: 'utf8',
      })
    );
    const converted = summary.outputPaths
      .map((outputPath: string) => readFileSync(outputPath, 'utf-8'))
      .join('\n');

    expect(converted).toContain('INSERT INTO "repos" ("id"');
    expect(converted).toContain('UPDATE repos SET description = description || CAST');
    expect(
      converted
        .split('\n')
        .filter(Boolean)
        .every((statement: string) => Buffer.byteLength(statement) < 96 * 1024)
    ).toBe(true);
  });

  it('caps Vectorize transfer files at the HTTP API batch limit', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/convert-turso-vectors.mjs'), 'utf-8');
    expect(source).toContain('MAX_VECTORS_PER_FILE = 5_000');
    expect(source).toContain('vectorsInFile >= MAX_VECTORS_PER_FILE');
  });
});
