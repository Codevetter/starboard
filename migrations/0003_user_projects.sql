-- User-owned public GitHub projects used as recommendation context.
CREATE TABLE IF NOT EXISTS user_projects (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repo_id      INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_user_projects_user_connected
  ON user_projects(user_id, connected_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_projects_repo
  ON user_projects(repo_id);

