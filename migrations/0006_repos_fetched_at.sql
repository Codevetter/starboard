-- Track when a repos row's GitHub metadata (stars, topics, description) was
-- last fetched. NULL means the row predates freshness tracking and is treated
-- as stale, so refresh-on-read paths self-heal on the next request. Distinct
-- from cataloged_at (first seen locally) and repo_updated_at (GitHub's own
-- pushed/updated timestamp).

ALTER TABLE repos ADD COLUMN fetched_at TEXT;

CREATE INDEX IF NOT EXISTS idx_repos_fetched_at ON repos (fetched_at);
