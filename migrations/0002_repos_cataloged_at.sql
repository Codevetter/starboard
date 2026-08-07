-- Track when a repository first entered the Starboard catalogue (seed/sync
-- ingest). Distinct from GitHub's repo_created_at. Used by /catalog-updates.
-- ON CONFLICT DO UPDATE paths must not overwrite this column.

ALTER TABLE repos ADD COLUMN cataloged_at TEXT;

-- Prefer earliest local snapshot as "first seen by us"; fall back to GitHub
-- created_at, then now. Existing rows without history get a stable backfill.
UPDATE repos
SET cataloged_at = COALESCE(
  (
    SELECT MIN(s.captured_at)
    FROM repo_star_snapshots s
    WHERE s.repo_id = repos.id
  ),
  repo_created_at,
  datetime('now')
)
WHERE cataloged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_repos_cataloged_at ON repos (cataloged_at DESC);
