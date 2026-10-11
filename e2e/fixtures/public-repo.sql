INSERT OR REPLACE INTO repos
  (id, name, full_name, owner_login, owner_avatar, html_url, description, language,
   stargazers_count, archived, topics, repo_created_at, repo_updated_at, fetched_at)
VALUES (1, 'starboard', 'codevetter/starboard', 'codevetter',
  'https://avatars.githubusercontent.com/u/1?v=4', 'https://github.com/codevetter/starboard',
  'Project-aware open-source discovery and tool intelligence.', 'TypeScript',
  12500, 0, '["github","discovery"]', '2026-01-01T00:00:00Z', '2026-08-01T00:00:00Z', datetime('now'));
