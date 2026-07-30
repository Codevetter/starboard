const SYNC_README_FETCH_LIMIT = 25;
const SYNC_RESULT_NAME_LIMIT = 8;

export function selectSyncReadmeRepos<T>(repos: T[]): T[] {
  return repos.slice(0, SYNC_README_FETCH_LIMIT);
}

export function summarizeSyncRepoNames(
  repos: Array<{ full_name: string }>,
  limit = SYNC_RESULT_NAME_LIMIT
): string {
  const visible = repos.slice(0, Math.max(0, limit)).map((repo) => repo.full_name);
  const remaining = repos.length - visible.length;
  if (remaining > 0) visible.push(`and ${remaining} more`);
  return visible.join(', ');
}
