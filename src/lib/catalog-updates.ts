/**
 * Public catalogue-ingestion history — analogous to anime-list's
 * /catalog-updates (recently added titles), not the product /changelog.
 */

import type { DbClient } from '@/db/client';

const CATALOG_MIN_STARS_FLOOR = 5000;
export const CATALOG_UPDATES_DEFAULT_LIMIT = 200;
const CATALOG_UPDATES_MAX_LIMIT = 500;

export interface CatalogChangeEntry {
  date: string;
  id: number;
  fullName: string;
  name: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  ownerLogin: string;
  ownerAvatar: string;
  htmlUrl: string;
}

interface CatalogUpdatesSummary {
  totalCatalogRepos: number;
  minStarsFloor: number;
  newestCatalogedAt: string | null;
  changesReturned: number;
  refreshCadence: string;
}

export interface CatalogUpdatesPayload {
  changes: CatalogChangeEntry[];
  summary: CatalogUpdatesSummary;
}

export function clampCatalogLimit(raw: number | string | null | undefined): number {
  const parsed = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  const n = Number.isFinite(parsed) ? parsed : CATALOG_UPDATES_DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), CATALOG_UPDATES_MAX_LIMIT);
}

export function groupCatalogChangesByDate(
  changes: CatalogChangeEntry[]
): { date: string; entries: CatalogChangeEntry[] }[] {
  const map = new Map<string, CatalogChangeEntry[]>();
  for (const entry of changes) {
    const list = map.get(entry.date) ?? [];
    list.push(entry);
    map.set(entry.date, list);
  }
  return [...map.entries()].map(([date, entries]) => ({ date, entries }));
}

export function formatCatalogDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function mapChangeRow(row: Record<string, unknown>): CatalogChangeEntry {
  return {
    date: String(row.catalog_date ?? ''),
    id: Number(row.id),
    fullName: String(row.full_name ?? ''),
    name: String(row.name ?? ''),
    description: (row.description as string | null) ?? null,
    language: (row.language as string | null) ?? null,
    stargazersCount: Number(row.stargazers_count ?? 0) || 0,
    ownerLogin: String(row.owner_login ?? ''),
    ownerAvatar: String(row.owner_avatar ?? ''),
    htmlUrl: String(row.html_url ?? ''),
  };
}

/**
 * Load catalogue ingestion history from D1. Used by the RSC page (primary UX)
 * and the public JSON API. Prefer the RSC path in browsers — edge rate limits
 * have been observed on client-side /api/* bursts during page load.
 */
export async function loadCatalogUpdates(
  database: DbClient,
  limitInput: number | string | null | undefined = CATALOG_UPDATES_DEFAULT_LIMIT
): Promise<CatalogUpdatesPayload> {
  const limit = clampCatalogLimit(limitInput);

  const [changesResult, totalResult, newestResult] = await Promise.all([
    database.execute({
      sql: `SELECT r.id,
                   r.name,
                   r.full_name,
                   r.description,
                   r.language,
                   r.stargazers_count,
                   r.owner_login,
                   r.owner_avatar,
                   r.html_url,
                   DATE(COALESCE(r.cataloged_at, r.repo_created_at, datetime('now'))) AS catalog_date
            FROM repos r
            WHERE r.stargazers_count >= ?
            ORDER BY COALESCE(r.cataloged_at, r.repo_created_at, datetime('now')) DESC
            LIMIT ?`,
      args: [CATALOG_MIN_STARS_FLOOR, limit],
    }),
    database.execute({
      sql: `SELECT COUNT(*) AS c FROM repos WHERE stargazers_count >= ?`,
      args: [CATALOG_MIN_STARS_FLOOR],
    }),
    database.execute({
      sql: `SELECT MAX(COALESCE(cataloged_at, repo_created_at)) AS newest
            FROM repos
            WHERE stargazers_count >= ?`,
      args: [CATALOG_MIN_STARS_FLOOR],
    }),
  ]);

  const changes = changesResult.rows.map(mapChangeRow);

  return {
    changes,
    summary: {
      totalCatalogRepos: Number(totalResult.rows[0]?.c ?? 0) || 0,
      minStarsFloor: CATALOG_MIN_STARS_FLOOR,
      newestCatalogedAt: (newestResult.rows[0]?.newest as string | null) ?? null,
      changesReturned: changes.length,
      refreshCadence:
        'Manual seed-popular GitHub Action (auto daily schedule paused); user star sync is on-demand.',
    },
  };
}
