-- Repository detail routes resolve owner/name case-insensitively. Without a
-- matching collation index, every lookup scans the full public catalog.
CREATE INDEX IF NOT EXISTS idx_repos_full_name_nocase
  ON repos(full_name COLLATE NOCASE);
