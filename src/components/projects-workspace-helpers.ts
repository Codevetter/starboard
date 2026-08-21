import type { RecommendationRetrievalMode } from '@/lib/analytics';

export function retrievalLabel(mode: RecommendationRetrievalMode): string {
  if (mode === 'hybrid') return 'Broad evidence match';
  if (mode === 'semantic') return 'Meaning-based match';
  if (mode === 'lexical-structured') return 'Catalog-context match';
  if (mode === 'structured') return 'Language match';
  return 'Broad catalog fallback';
}
