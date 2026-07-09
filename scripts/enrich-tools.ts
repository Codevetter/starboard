/**
 * Bounded repository tool enrichment.
 *
 * Required env:
 *   TURSO_DATABASE_URL
 *   TURSO_AUTH_TOKEN
 * Optional env:
 *   GITHUB_TOKEN              — recommended for rate limits
 *   TOOL_ENRICH_LIMIT         — repos to process, default 250
 *   TOOL_ENRICH_HARD_LIMIT    — max repos per run, default 750
 *   TOOL_MIN_STARS            — seeded corpus floor, default 10000
 *   TOOL_MAX_FILES_PER_REPO   — manifest/build files to fetch per repo, default 16
 */

import { createHash } from 'node:crypto';

import { type Client, createClient, type InStatement } from '@libsql/client';

import {
  detectToolsFromManifest,
  detectToolsFromRepoSignals,
  detectToolsFromSbomPackageNames,
  isPotentialToolManifest,
  mergeToolDetections,
  type ToolDetection,
} from '../src/lib/repo-tools';

const REQUESTED_LIMIT = parseInt(process.env.TOOL_ENRICH_LIMIT || '250', 10);
const HARD_LIMIT = parseInt(process.env.TOOL_ENRICH_HARD_LIMIT || '750', 10);
const LIMIT = Math.min(Math.max(REQUESTED_LIMIT || 0, 0), HARD_LIMIT);
const MIN_STARS = parseInt(process.env.TOOL_MIN_STARS || '10000', 10);
const MAX_FILES_PER_REPO = parseInt(process.env.TOOL_MAX_FILES_PER_REPO || '16', 10);
const API_VERSION = '2026-03-10';

interface PendingRepo {
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  topics: string;
  stargazers_count: number;
  repo_updated_at: string | null;
  existing_source_hash: string | null;
}

interface GitHubRepo {
  default_branch: string;
}

interface GitHubTree {
  truncated?: boolean;
  tree?: Array<{ path?: string; type?: string; size?: number }>;
}

interface GitHubContent {
  content?: string;
  encoding?: string;
}

interface GitHubSbom {
  sbom?: {
    packages?: Array<{ name?: string }>;
  };
}

function headers() {
  const token = process.env.GITHUB_TOKEN?.trim();
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function repoSourceHash(repo: PendingRepo): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: repo.id,
        updated: repo.repo_updated_at,
        topics: repo.topics,
        stars: repo.stargazers_count,
      })
    )
    .digest('hex');
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { headers: headers() });
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) {
    throw new Error(`GitHub ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function manifestPriority(path: string): number {
  const depth = path.split('/').length;
  const lower = path.toLowerCase();
  if (!path.includes('/')) return 0;
  if (lower.includes('/examples/') || lower.includes('/test') || lower.includes('/docs/'))
    return 20 + depth;
  return depth;
}

async function loadPending(db: Client): Promise<PendingRepo[]> {
  const result = await db.execute({
    sql: `SELECT r.id,
                 r.full_name,
                 r.description,
                 r.language,
                 r.topics,
                 r.stargazers_count,
                 r.repo_updated_at,
                 state.source_hash AS existing_source_hash
          FROM repos r
          LEFT JOIN repo_tool_enrichment_state state ON state.repo_id = r.id
          WHERE r.stargazers_count >= ?
             OR EXISTS (
                  SELECT 1 FROM user_repos ur
                  WHERE ur.repo_id = r.id
                    AND (ur.is_starred = 1 OR ur.is_saved = 1)
                )
          ORDER BY
            CASE WHEN state.repo_id IS NULL THEN 0 ELSE 1 END ASC,
            r.stargazers_count DESC
          LIMIT ?`,
    args: [MIN_STARS, LIMIT * 4],
  });

  const pending: PendingRepo[] = [];
  for (const row of result.rows) {
    const repo = {
      id: row.id as number,
      full_name: row.full_name as string,
      description: row.description as string | null,
      language: row.language as string | null,
      topics: row.topics as string,
      stargazers_count: row.stargazers_count as number,
      repo_updated_at: row.repo_updated_at as string | null,
      existing_source_hash: row.existing_source_hash as string | null,
    };
    if (repo.existing_source_hash !== repoSourceHash(repo)) pending.push(repo);
    if (pending.length >= LIMIT) break;
  }
  return pending;
}

async function fetchSbomTools(repo: PendingRepo): Promise<ToolDetection[]> {
  const data = await fetchJson<GitHubSbom>(
    `https://api.github.com/repos/${repo.full_name}/dependency-graph/sbom`
  );
  const names = data?.sbom?.packages?.map((pkg) => pkg.name).filter(Boolean) ?? [];
  return detectToolsFromSbomPackageNames(names as string[]);
}

async function fetchManifestFiles(
  repo: PendingRepo
): Promise<Array<{ path: string; content: string }>> {
  const metadata = await fetchJson<GitHubRepo>(`https://api.github.com/repos/${repo.full_name}`);
  const branch = metadata?.default_branch || 'HEAD';
  const tree = await fetchJson<GitHubTree>(
    `https://api.github.com/repos/${repo.full_name}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );

  const paths =
    tree?.tree
      ?.filter((item) => item.type === 'blob' && item.path && isPotentialToolManifest(item.path))
      .map((item) => item.path!)
      .sort((a, b) => manifestPriority(a) - manifestPriority(b) || a.localeCompare(b))
      .slice(0, MAX_FILES_PER_REPO) ?? [];

  const files: Array<{ path: string; content: string }> = [];
  for (const path of paths) {
    const data = await fetchJson<GitHubContent>(
      `https://api.github.com/repos/${repo.full_name}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`
    );
    if (!data?.content || data.encoding !== 'base64') continue;
    files.push({
      path,
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
    });
  }

  if (tree?.truncated) {
    console.warn(`[tools] ${repo.full_name} tree was truncated; detection may be incomplete`);
  }
  return files;
}

async function saveTools(
  db: Client,
  repo: PendingRepo,
  tools: ToolDetection[],
  sourceHash: string,
  status: string,
  error: string | null = null
) {
  const statements: InStatement[] = [
    { sql: 'DELETE FROM repo_tools WHERE repo_id = ?', args: [repo.id] },
    {
      sql: `INSERT INTO repo_tool_enrichment_state (repo_id, source_hash, status, error, processed_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(repo_id) DO UPDATE SET
              source_hash = excluded.source_hash,
              status = excluded.status,
              error = excluded.error,
              processed_at = datetime('now')`,
      args: [repo.id, sourceHash, status, error],
    },
  ];

  for (const tool of tools) {
    statements.push({
      sql: `INSERT INTO repo_tools
              (repo_id, tool_key, tool_name, category, confidence, sources, detected_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        repo.id,
        tool.toolKey,
        tool.toolName,
        tool.category,
        tool.confidence,
        JSON.stringify(tool.sources),
      ],
    });
  }

  await db.batch(statements);
}

async function enrichRepo(db: Client, repo: PendingRepo) {
  const baseHash = repoSourceHash(repo);
  const signalTools = detectToolsFromRepoSignals({
    language: repo.language,
    topics: repo.topics,
    description: repo.description,
  });

  const sbomTools = await fetchSbomTools(repo).catch((error) => {
    console.warn(`[tools] ${repo.full_name} SBOM unavailable: ${String(error)}`);
    return [];
  });
  const files = await fetchManifestFiles(repo);
  const manifestTools = files.flatMap((file) => detectToolsFromManifest(file.path, file.content));
  const tools = mergeToolDetections([...sbomTools, ...manifestTools, ...signalTools]);

  await saveTools(db, repo, tools, baseHash, 'ok');
  console.info(
    `[tools] ${repo.full_name}: ${tools.length} tools from ${files.length} files (${repo.stargazers_count} stars)`
  );
}

async function main() {
  if (LIMIT <= 0) {
    console.info('[tools] TOOL_ENRICH_LIMIT is 0; nothing to do');
    return;
  }

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const pending = await loadPending(db);
  console.info(
    `[tools] enriching ${pending.length} repos limit=${LIMIT} min_stars=${MIN_STARS} max_files=${MAX_FILES_PER_REPO}`
  );

  for (const repo of pending) {
    try {
      await enrichRepo(db, repo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[tools] ${repo.full_name} failed: ${message}`);
      await saveTools(db, repo, [], repoSourceHash(repo), 'error', message.slice(0, 500));
    }
  }
}

main().catch((error) => {
  console.error('Tool enrichment failed:', error);
  process.exit(1);
});
