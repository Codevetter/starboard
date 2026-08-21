import type { SortOption, UseStarredReposOptions } from './use-starred-repos';

const sortMap: Record<SortOption, string> = {
  relevance: 'relevance',
  'recently-starred': 'starred',
  'most-stars': 'stars',
  'fastest-growing': 'growth',
  'recently-updated': 'updated',
  'name-az': 'name',
};

export function buildStarsUrl(opts: UseStarredReposOptions, offset: number): string {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.language?.length) params.set('language', opts.language.join(','));
  if (opts.listId != null) params.set('list_id', String(opts.listId));
  const apiSort = sortMap[opts.sort ?? 'recently-starred'];
  if (apiSort !== 'starred') params.set('sort', apiSort);
  const limit = opts.limit ?? 50;
  if (limit !== 50) params.set('limit', String(limit));
  if (offset > 0) params.set('offset', String(offset));
  const qs = params.toString();
  return qs.length > 0 ? `/api/stars?${qs}` : '/api/stars';
}

export function starsFilterKey(opts: UseStarredReposOptions): string {
  return JSON.stringify({
    q: opts.q ?? '',
    lang: opts.language ?? [],
    list: opts.listId ?? null,
    sort: opts.sort ?? 'recently-starred',
  });
}
