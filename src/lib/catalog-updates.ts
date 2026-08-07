/**
 * Public catalogue-ingestion history — analogous to anime-list's
 * /catalog-updates (recently added titles), not the product /changelog.
 */

export const CATALOG_MIN_STARS_FLOOR = 5000;

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

export interface CatalogUpdatesSummary {
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
