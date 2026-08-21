import type { SortOption } from '@/hooks/use-starred-repos';

import type { UseDiscoverReposOptions } from './use-discover-repos';

const sortMap: Record<SortOption, string> = {
  relevance: 'relevance',
  'recently-starred': 'stars',
  'most-stars': 'stars',
  'fastest-growing': 'growth',
  'recently-updated': 'updated',
  'name-az': 'name',
};

export function buildDiscoverUrl(opts: UseDiscoverReposOptions, offset: number): string {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.language?.length) params.set('language', opts.language.join(','));
  if (opts.listId != null) params.set('list_id', String(opts.listId));
  if (opts.tools?.length) params.set('tool', opts.tools.join(','));
  const apiSort = sortMap[opts.sort ?? 'most-stars'];
  if (apiSort !== 'stars') params.set('sort', apiSort);
  const limit = opts.limit ?? 50;
  if (limit !== 50) params.set('limit', String(limit));
  if (offset > 0) params.set('offset', String(offset));
  const qs = params.toString();
  return qs.length > 0 ? `/discover/data?${qs}` : '/discover/data';
}

export function discoverFilterKey(opts: UseDiscoverReposOptions): string {
  return JSON.stringify({
    q: opts.q ?? '',
    lang: opts.language ?? [],
    list: opts.listId ?? null,
    tools: opts.tools ?? [],
    sort: opts.sort ?? 'most-stars',
  });
}
