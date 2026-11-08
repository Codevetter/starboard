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

-- Public GitHub metadata captured 2026-11-08 for the admitted catalog boundary.
INSERT OR REPLACE INTO repos (id,name,full_name,owner_login,owner_avatar,html_url,description,language,stargazers_count,archived,topics,repo_created_at,repo_updated_at,fetched_at) VALUES (22486533,'shattered-pixel-dungeon','00-Evan/shattered-pixel-dungeon','00-Evan','https://avatars.githubusercontent.com/u/2347603?v=4','https://github.com/00-Evan/shattered-pixel-dungeon','Shattered Pixel Dungeon is an open-source traditional roguelike dungeon crawler with randomized levels and enemies, and hundreds of items to collect and use. It''s based on the source code of Pixel Dungeon, by Watabou.','Java',6773,0,'["android","game","game-development","ios","java","libgdx"]','2014-07-31T21:56:31Z','2026-11-08T06:05:20Z',datetime('now'));

-- Public React metadata and retained tool signals captured 2026-11-08.
INSERT OR REPLACE INTO repos (id,name,full_name,owner_login,owner_avatar,html_url,description,language,stargazers_count,archived,topics,repo_created_at,repo_updated_at,fetched_at) VALUES (10270250,'react','react/react','react','https://avatars.githubusercontent.com/u/102812?v=4','https://github.com/react/react','The library for web and native user interfaces.','JavaScript',252386,0,'["declarative","frontend","javascript","library","react","ui"]','2013-05-24T16:15:54Z','2026-11-08T06:41:07Z',datetime('now'));
INSERT OR REPLACE INTO repo_tools (repo_id,tool_key,tool_name,category,confidence,sources,detected_at) VALUES (10270250,'cargo','Cargo','package-manager',98,'["compiler/Cargo.lock","compiler/Cargo.toml"]','2026-07-09 14:49:01');
INSERT OR REPLACE INTO repo_tools (repo_id,tool_key,tool_name,category,confidence,sources,detected_at) VALUES (10270250,'eslint','ESLint','testing',98,'["github-sbom","package.json"]','2026-07-09 14:49:01');
INSERT OR REPLACE INTO repo_tools (repo_id,tool_key,tool_name,category,confidence,sources,detected_at) VALUES (10270250,'electron','Electron','framework',98,'["github-sbom"]','2026-07-09 14:49:01');
