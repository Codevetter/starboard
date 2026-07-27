import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Static regression guards for the row-read burn fixed in this commit.
// These assert that the index and query shapes that prevent the
// O(|repos| × |user_repos|) row-read explosion remain in place, and that
// the daily db:migrate does not unconditionally rebuild the FTS5 index
// (which scans every row of the source table).

const schemaSql = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
const migrateTs = readFileSync(join(__dirname, '..', 'db', 'migrate.ts'), 'utf-8');
const seedPopularTs = readFileSync(
  join(__dirname, '..', '..', 'scripts', 'seed-popular.ts'),
  'utf-8'
);
const seedWorkflow = readFileSync(
  join(__dirname, '..', '..', '.github', 'workflows', 'seed-popular.yml'),
  'utf-8'
);
const workflowsDirectory = join(__dirname, '..', '..', '.github', 'workflows');

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
    // incrementally. An unconditional 'rebuild' on every db:migrate
    // re-tokenizes every row of repos and repo_ai_metadata for no benefit.
    const rebuildCalls = [...migrateTs.matchAll(/INSERT INTO (\w+)\(\1\)\s*VALUES\('rebuild'\)/g)];
    expect(rebuildCalls.length).toBeGreaterThan(0); // the guarded calls exist

    // Probing one row avoids turning the guard itself into a full FTS scan.
    expect(migrateTs).toContain('SELECT 1 AS present FROM repos_fts LIMIT 1');
    expect(migrateTs).toContain('SELECT 1 AS present FROM repo_ai_metadata_fts LIMIT 1');
    expect(migrateTs).not.toContain('SELECT COUNT(*) AS c FROM repos_fts');
    expect(migrateTs).not.toContain('SELECT COUNT(*) AS c FROM repo_ai_metadata_fts');
  });

  it('seed-popular skips unchanged repo updates and snapshots', () => {
    expect(seedPopularTs).toContain('storedRepoDiffers');
    expect(seedPopularTs).toMatch(
      /const changedRepos = repos\.filter\(\(repo\) => storedRepoDiffers\(storedRepos\.get\(repo\.id\), repo\)\)/
    );
    expect(seedPopularTs).toContain('WHERE repos.name IS NOT excluded.name');
    expect(seedPopularTs).toMatch(/const snapshotStmts:[\s\S]*changedRepos[\s\S]*stargazers_count/);
  });

  it('scheduled full-corpus seed runs are disabled and page-bounded', () => {
    expect(seedWorkflow).not.toMatch(/^\s+schedule:/m);
    expect(seedWorkflow).toContain("SEED_METADATA_PAGE_LIMIT: '10'");
    expect(seedPopularTs).toContain("process.env.SEED_METADATA_PAGE_LIMIT || '10'");
    expect(seedPopularTs).toContain(', 25);');
  });

  it('no Turso-backed workflow can run unattended', () => {
    const scheduledDatabaseWorkflows = readdirSync(workflowsDirectory)
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
      .filter((file) => {
        const workflow = readFileSync(join(workflowsDirectory, file), 'utf-8');
        return workflow.includes('TURSO_DATABASE_URL') && /^\s+schedule:/m.test(workflow);
      });

    expect(scheduledDatabaseWorkflows).toEqual([]);
  });

  it('legacy list backfills are guarded by a durable migration marker', () => {
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS migration_markers');
    expect(schemaSql).toContain(
      "INSERT OR IGNORE INTO migration_markers (key) VALUES ('legacy-lists-tags-v1')"
    );
    expect(migrateTs).toContain("args: ['legacy-lists-tags-v1']");
    expect(migrateTs).toMatch(/if \(legacyListMigration\.rows\.length === 0\)/);
  });
});
