import type { ProjectIntelligenceResult } from './project-intelligence';

type Retrieval = ProjectIntelligenceResult['retrieval'];

export function retrievalCoverageMessage(retrieval: Retrieval): string | null {
  const unavailable = retrieval.unavailableSources;
  if (!unavailable?.length) return null;
  const names = unavailable.map((source) =>
    source === 'semantic' ? 'Meaning-based' : source === 'lexical' ? 'Keyword' : 'Language'
  );
  return `${names.join(', ')} retrieval is temporarily unavailable. Matches cover the available catalog sources only; an empty result does not establish that no relevant projects exist.`;
}

export function reviewedMatchesLabel(count: number, retrieval: Retrieval): string {
  if (count) return 'Reviewed matches';
  return retrieval.unavailableSources?.length
    ? 'No reviewed matches in available sources'
    : 'No relevant matches';
}
