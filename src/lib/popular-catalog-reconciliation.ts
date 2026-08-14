const DAY_MS = 24 * 60 * 60 * 1000;

export const GITHUB_SEARCH_PAGE_SIZE = 100;
const GITHUB_REPOSITORY_EPOCH = '2007-01-01';

export interface CatalogRepoIdentity {
  id: number;
  fullName: string;
}

export interface CatalogSearchResult {
  totalCount: number;
  incomplete: boolean;
  repos: CatalogRepoIdentity[];
}

export type CatalogSearch = (query: string) => Promise<CatalogSearchResult>;

export interface CatalogEnumeration {
  repos: Map<number, CatalogRepoIdentity>;
  sourceCount: number;
  leafPartitions: number;
}

export interface CatalogReconciliationPlan {
  additions: CatalogRepoIdentity[];
  storedOnlyCount: number;
}

interface UtcDayRange {
  start: number;
  end: number;
}

function parseUtcDay(value: string): number {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || timestamp % DAY_MS !== 0) {
    throw new Error(`Invalid UTC date: ${value}`);
  }
  return timestamp / DAY_MS;
}

function formatUtcDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function validateSearchResult(result: CatalogSearchResult, label: string): void {
  if (result.incomplete) {
    throw new Error(`GitHub returned incomplete catalog evidence for ${label}`);
  }
  if (!Number.isInteger(result.totalCount) || result.totalCount < 0) {
    throw new Error(`GitHub returned an invalid total count for ${label}`);
  }
  if (result.repos.length > GITHUB_SEARCH_PAGE_SIZE) {
    throw new Error(`GitHub returned too many repository identities for ${label}`);
  }
}

function popularCatalogQuery(minStars: number): string {
  return `stars:>=${minStars}`;
}

function popularCatalogDateQuery(minStars: number, startDate: string, endDate: string): string {
  return `${popularCatalogQuery(minStars)} created:${startDate}..${endDate}`;
}

/**
 * Enumerate the full eligible catalog without paging a mutable star ordering.
 * Creation-date ranges are recursively split until every leaf fits in one
 * GitHub Search response, so the 1,000-result search window is never reached.
 */
export async function enumeratePopularCatalog(
  search: CatalogSearch,
  options: {
    minStars: number;
    minExpectedRepos: number;
    startDate?: string;
    endDate?: string;
  }
): Promise<CatalogEnumeration> {
  const rootQuery = popularCatalogQuery(options.minStars);
  const before = await search(rootQuery);
  validateSearchResult(before, rootQuery);
  if (before.totalCount < options.minExpectedRepos) {
    throw new Error(
      `GitHub source count ${before.totalCount} is below safety floor ${options.minExpectedRepos}`
    );
  }

  const start = parseUtcDay(options.startDate ?? GITHUB_REPOSITORY_EPOCH);
  const end = parseUtcDay(options.endDate ?? new Date().toISOString().slice(0, 10));
  if (start > end) throw new Error('Catalog enumeration start date is after its end date');

  const repos = new Map<number, CatalogRepoIdentity>();
  let leafPartitions = 0;

  async function collect(range: UtcDayRange): Promise<void> {
    const startDate = formatUtcDay(range.start);
    const endDate = formatUtcDay(range.end);
    const query = popularCatalogDateQuery(options.minStars, startDate, endDate);
    const result = await search(query);
    validateSearchResult(result, query);

    if (result.totalCount > GITHUB_SEARCH_PAGE_SIZE) {
      if (range.start === range.end) {
        throw new Error(
          `GitHub catalog date ${startDate} has ${result.totalCount} results; ` +
            `one-response enumeration cannot prove completeness`
        );
      }
      const midpoint = Math.floor((range.start + range.end) / 2);
      await collect({ start: range.start, end: midpoint });
      await collect({ start: midpoint + 1, end: range.end });
      return;
    }

    if (result.repos.length !== result.totalCount) {
      throw new Error(
        `GitHub catalog range ${startDate}..${endDate} returned ` +
          `${result.repos.length}/${result.totalCount} repositories`
      );
    }

    leafPartitions += 1;
    for (const repo of result.repos) {
      if (!Number.isInteger(repo.id) || repo.id <= 0 || !repo.fullName.trim()) {
        throw new Error(`GitHub returned an invalid repository identity for ${query}`);
      }
      if (repos.has(repo.id)) {
        throw new Error(`GitHub returned duplicate repository ID ${repo.id} across partitions`);
      }
      repos.set(repo.id, repo);
    }
  }

  await collect({ start, end });

  const after = await search(rootQuery);
  validateSearchResult(after, rootQuery);
  if (after.totalCount !== before.totalCount) {
    throw new Error(
      `GitHub source count changed during enumeration: ${before.totalCount} -> ${after.totalCount}`
    );
  }
  if (repos.size !== before.totalCount) {
    throw new Error(
      `GitHub source reconciliation failed: enumerated ${repos.size}/${before.totalCount} unique IDs`
    );
  }

  return { repos, sourceCount: before.totalCount, leafPartitions };
}

export function planCatalogReconciliation(
  sourceRepos: Map<number, CatalogRepoIdentity>,
  storedIds: Set<number>,
  maxAdditions: number
): CatalogReconciliationPlan {
  if (!Number.isInteger(maxAdditions) || maxAdditions < 0) {
    throw new Error(`Invalid maximum additions bound: ${maxAdditions}`);
  }

  const additions = [...sourceRepos.values()].filter((repo) => !storedIds.has(repo.id));
  if (additions.length > maxAdditions) {
    throw new Error(
      `Catalog additions ${additions.length} exceed safety bound ${maxAdditions}; no writes performed`
    );
  }

  let storedOnlyCount = 0;
  for (const id of storedIds) {
    if (!sourceRepos.has(id)) storedOnlyCount += 1;
  }

  return { additions, storedOnlyCount };
}
