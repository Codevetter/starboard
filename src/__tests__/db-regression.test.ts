import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Static regression guards for the row-read burn fixed in this commit.
// These assert that the index and query shapes that prevent the
// O(|repos| × |user_repos|) row-read explosion remain in place, and that
// the daily db:migrate does not unconditionally rebuild the FTS5 index
// (which scans every row of the source table).

const schemaSql = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
const migrateTs = readFileSync(join(__dirname, '..', 'db', 'migrate.ts'), 'utf-8');

describe('db row-read regression guards', () => {
  it('schema.sql defines idx_user_repos_repo for repo_id lookups', () => {
    // The user_repos PK is (user_id, repo_id) and cannot serve repo_id-only
    // lookups. Without this index, every eligibility filter that joins
    // repos to user_repos by repo_id degrades to a full scan of user_repos
    // per repo row.
    expect(schemaSql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_user_repos_repo ON user_repos\(repo_id\)/
    );
  });

  it('migrate.ts does not unconditionally rebuild FTS5 indexes', () => {
    // The AFTER INSERT/UPDATE/DELETE triggers maintain the FTS index
    // incrementally. An unconditional 'rebuild' on every db:migrate (which
    // fires daily from the seed-popular workflow) re-tokenizes every row
    // of repos and repo_ai_metadata for no benefit.
    const rebuildCalls = [...migrateTs.matchAll(/INSERT INTO (\w+)\(\1\)\s*VALUES\('rebuild'\)/g)];
    expect(rebuildCalls.length).toBeGreaterThan(0); // the guarded calls exist

    // Every rebuild must be wrapped in a COUNT(*) === 0 guard.
    const guardedPattern =
      /if\s*\(\s*\([\w.]+\.rows\[0\]\?\.c\s+as\s+number\)\s*===\s*0\s*\)\s*\{[^}]*VALUES\('rebuild'\)[^}]*\}/;
    expect(migrateTs).toMatch(guardedPattern);
  });
});
