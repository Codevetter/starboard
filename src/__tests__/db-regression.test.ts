import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Static regression guards for the row-read burn fixed in this commit.
// These assert that the index and query shapes that prevent the
// O(|repos| × |user_repos|) row-read explosion remain in place, and that
// the migration does not unconditionally rebuild the FTS5 index.

const schemaSql = readFileSync(
  join(__dirname, '..', '..', 'migrations', '0001_initial.sql'),
  'utf-8'
);
const seedPopularTs = readFileSync(
  join(__dirname, '..', '..', 'scripts', 'seed-popular.ts'),
  'utf-8'
);
const seedWorkflow = readFileSync(
  join(__dirname, '..', '..', '.github', 'workflows', 'seed-popular.yml'),
  'utf-8'
);
const workflowsDirectory = join(__dirname, '..', '..', '.github', 'workflows');
const projectsMigration = readFileSync(
  join(__dirname, '..', '..', 'migrations', '0003_user_projects.sql'),
  'utf-8'
);

describe('db row-read regression guards', () => {
  it('the D1 migration defines idx_user_repos_repo for repo_id lookups', () => {
    // The user_repos PK is (user_id, repo_id) and cannot serve repo_id-only
    // lookups. Without this index, every eligibility filter that joins
    // repos to user_repos by repo_id degrades to a full scan of user_repos
    // per repo row.
    expect(schemaSql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_user_repos_repo ON user_repos\(repo_id\)/
    );
  });

  it('the D1 migration relies on incremental FTS triggers', () => {
    expect(schemaSql).toContain('CREATE TRIGGER IF NOT EXISTS repos_ai');
    expect(schemaSql).toContain('CREATE TRIGGER IF NOT EXISTS repo_ai_metadata_ai');
    expect(schemaSql).not.toMatch(/INSERT INTO (\w+)\(\1\)\s*VALUES\('rebuild'\)/);
  });

  it('seed-popular skips unchanged repo updates and snapshots', () => {
    expect(seedPopularTs).toContain('storedRepoDiffers');
    expect(seedPopularTs).toMatch(
      /const changedRepos = repos\.filter\(\(repo\) => storedRepoDiffers\(storedRepos\.get\(repo\.id\), repo\)\)/
    );
    expect(seedPopularTs).toContain('WHERE repos.name IS NOT excluded.name');
    expect(seedPopularTs).toMatch(/const snapshotStmts:[\s\S]*changedRepos[\s\S]*stargazers_count/);
  });

  it('daily seed runs stay scheduled and operationally bounded', () => {
    expect(seedWorkflow).toContain("cron: '0 3 * * *'");
    expect(seedWorkflow).toContain('timeout-minutes: 60');
    expect(seedWorkflow).toContain('cancel-in-progress: false');
    expect(seedWorkflow).toContain("SEED_METADATA_PAGE_LIMIT: '10'");
    expect(seedPopularTs).toContain("process.env.SEED_METADATA_PAGE_LIMIT || '10'");
    expect(seedPopularTs).toContain(', 25);');
  });

  it('no Turso-backed workflow remains', () => {
    const scheduledDatabaseWorkflows = readdirSync(workflowsDirectory)
      .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
      .filter((file) => {
        const workflow = readFileSync(join(workflowsDirectory, file), 'utf-8');
        return workflow.includes('TURSO_DATABASE_URL');
      });

    expect(scheduledDatabaseWorkflows).toEqual([]);
  });

  it('fresh D1 databases record the legacy list backfill marker', () => {
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS migration_markers');
    expect(schemaSql).toContain(
      "INSERT OR IGNORE INTO migration_markers (key) VALUES ('legacy-lists-tags-v1')"
    );
  });

  it('connected projects are isolated by user and indexed for project lists', () => {
    expect(projectsMigration).toContain('PRIMARY KEY (user_id, repo_id)');
    expect(projectsMigration).toContain(
      'CREATE INDEX IF NOT EXISTS idx_user_projects_user_connected'
    );
    expect(projectsMigration).toContain('REFERENCES repos(id) ON DELETE CASCADE');
  });
});
