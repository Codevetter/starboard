import { describe, expect, it } from 'vitest';

import { selectSyncReadmeRepos, summarizeSyncRepoNames } from '@/lib/sync-performance';

describe('large-library sync performance', () => {
  const repos = Array.from({ length: 1000 }, (_, index) => ({
    id: index + 1,
    full_name: `owner/repo-${index + 1}`,
  }));

  it('bounds synchronous README requests for a 1000-repo import', () => {
    const selected = selectSyncReadmeRepos(repos);

    expect(selected).toHaveLength(25);
    expect(selected[0]).toEqual(repos[0]);
    expect(selected.at(-1)).toEqual(repos[24]);
  });

  it('keeps the sync result summary bounded', () => {
    const summary = summarizeSyncRepoNames(repos);

    expect(summary).toBe(
      'owner/repo-1, owner/repo-2, owner/repo-3, owner/repo-4, owner/repo-5, owner/repo-6, owner/repo-7, owner/repo-8, and 992 more'
    );
    expect(summary).not.toContain('owner/repo-9,');
  });
});
