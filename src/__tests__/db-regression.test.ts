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

  it('seed-popular reads IDs once and writes additions without updating existing repos', () => {
    expect(seedPopularTs).toContain("executeDb(db, 'SELECT id FROM repos')");
    expect(seedPopularTs).toContain('planCatalogReconciliation');
    expect(seedPopularTs).toContain('INSERT OR IGNORE INTO repos');
    expect(seedPopularTs).not.toContain('stargazers_count = excluded.stargazers_count');
    expect(seedPopularTs).not.toContain('DELETE FROM repos');
    expect(seedPopularTs).not.toContain('UPDATE seed_cursor');
  });

  it('weekly full reconciliation stays scheduled and operationally bounded', () => {
    expect(seedWorkflow).toContain("cron: '17 3 * * 0'");
    expect(seedWorkflow).toContain('timeout-minutes: 60');
    expect(seedWorkflow).toContain('cancel-in-progress: false');
    expect(seedWorkflow).toContain("github.event.inputs.max_additions || '100'");
    expect(seedWorkflow).toContain("SEED_MIN_SOURCE_REPOS: '5000'");
    expect(seedPopularTs).toContain("process.env.SEED_MAX_ADDITIONS || '100'");
    expect(seedPopularTs).toContain('const MAX_ADDITIONS_HARD_LIMIT = 100');
    expect(seedPopularTs).toContain('exceeds hard safety limit');
    expect(seedPopularTs).toContain("process.env.SEED_MIN_SOURCE_REPOS || '5000'");
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
