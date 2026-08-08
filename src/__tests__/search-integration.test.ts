import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('D1 and Vectorize search integration', () => {
  it('keeps relational metadata in D1 and ANN values in Vectorize', () => {
    const migration = readFileSync(join(process.cwd(), 'migrations/0001_initial.sql'), 'utf-8');
    const similarRoute = readFileSync(
      join(process.cwd(), 'src/app/api/repos/[repoId]/similar/route.ts'),
      'utf-8'
    );
    expect(migration).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS repos_fts USING fts5');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS repo_embeddings');
    expect(migration).not.toContain('vector_top_k');
    expect(similarRoute).toContain('repoVectors().queryByRepoId');
  });
});
