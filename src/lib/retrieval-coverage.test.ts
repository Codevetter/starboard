import { describe, expect, it } from 'vitest';
import type { ProjectIntelligenceResult } from './project-intelligence';
import { retrievalCoverageMessage, reviewedMatchesLabel } from './retrieval-coverage';

const retrieval: ProjectIntelligenceResult['retrieval'] = {
  mode: 'lexical-structured',
  candidateCount: 0,
  semanticCandidates: 0,
  lexicalCandidates: 0,
  structuredCandidates: 0,
};

describe('retrieval coverage disclosure', () => {
  it('does not present an outage as a fully searched empty result', () => {
    const partial = { ...retrieval, unavailableSources: ['semantic'] as const };
    const result = { ...partial, unavailableSources: [...partial.unavailableSources] };
    expect(reviewedMatchesLabel(0, result)).toBe('No reviewed matches in available sources');
    expect(retrievalCoverageMessage(result)).toContain(
      'Meaning-based retrieval is temporarily unavailable'
    );
    expect(retrievalCoverageMessage(result)).toContain('an empty result does not establish');
  });

  it('retains normal empty-result and reviewed-match labels when lanes succeed', () => {
    expect(reviewedMatchesLabel(0, { ...retrieval, unavailableSources: [] })).toBe(
      'No relevant matches'
    );
    expect(reviewedMatchesLabel(2, { ...retrieval, unavailableSources: ['semantic'] })).toBe(
      'Reviewed matches'
    );
    expect(retrievalCoverageMessage({ ...retrieval, unavailableSources: [] })).toBeNull();
  });

  it('does not infer a failed source for older responses without availability metadata', () => {
    expect(retrievalCoverageMessage(retrieval)).toBeNull();
    expect(reviewedMatchesLabel(0, retrieval)).toBe('No relevant matches');
  });
});
