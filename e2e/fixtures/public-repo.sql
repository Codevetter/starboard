INSERT OR REPLACE INTO repos
  (id, name, full_name, owner_login, owner_avatar, html_url, description, language,
   stargazers_count, archived, topics, repo_created_at, repo_updated_at, fetched_at)
VALUES (1, 'starboard', 'codevetter/starboard', 'codevetter',
  'https://avatars.githubusercontent.com/u/1?v=4', 'https://github.com/codevetter/starboard',
  'Project-aware open-source discovery and tool intelligence.', 'TypeScript',
  12500, 0, '["github","discovery"]', '2026-01-01T00:00:00Z', '2026-08-01T00:00:00Z', datetime('now'));

-- Browser mocks cover client requests, but Next.js also prefetches repository
-- HTML on the server. Keep every valid mock-card slug in isolated local D1 so
-- these prefetches do not fall through to a live GitHub lookup.
WITH RECURSIVE fixture_repos(n) AS (
  SELECT 0
  UNION ALL
  SELECT n + 1 FROM fixture_repos WHERE n < 499
)
INSERT OR REPLACE INTO repos
  (id, name, full_name, owner_login, owner_avatar, html_url, description, language,
   stargazers_count, archived, topics, repo_created_at, repo_updated_at, fetched_at)
SELECT 10000 + n, 'repo-' || n, 'acme/repo-' || n, 'acme', '',
  'https://github.com/acme/repo-' || n, 'Offline public browser fixture.', 'TypeScript',
  12500, 0, '["fixture"]', '2026-01-01T00:00:00Z', '2026-08-01T00:00:00Z', datetime('now')
FROM fixture_repos;

INSERT OR REPLACE INTO repos
  (id, name, full_name, owner_login, owner_avatar, html_url, description, language,
   stargazers_count, archived, topics, repo_created_at, repo_updated_at, fetched_at)
VALUES
  (11000, 'high', 'acme/high', 'acme', '', 'https://github.com/acme/high',
   'Offline sort fixture.', 'TypeScript', 20000, 0, '["fixture"]',
   '2026-01-01T00:00:00Z', '2026-08-01T00:00:00Z', datetime('now')),
  (11001, 'low', 'acme/low', 'acme', '', 'https://github.com/acme/low',
   'Offline sort fixture.', 'TypeScript', 5000, 0, '["fixture"]',
   '2026-01-01T00:00:00Z', '2026-08-01T00:00:00Z', datetime('now')),
  (11002, 'peer', 'acme/peer', 'acme', '', 'https://github.com/acme/peer',
   'Offline similar-repository fixture.', 'TypeScript', 12500, 0, '["fixture"]',
   '2026-01-01T00:00:00Z', '2026-08-01T00:00:00Z', datetime('now'));
