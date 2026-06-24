import { describe, expect, it } from 'vitest';

import { recommendationEvalFixtures } from '@/__tests__/fixtures/recommendation-eval-fixture';
import {
  buildHybridRecommendationReport,
  compareRecommendationScorers,
  evaluateRecommendationFixture,
} from '@/lib/recommendation-eval';

const now = new Date('2026-06-06T00:00:00Z');

describe('recommendation eval harness', () => {
  for (const fixture of recommendationEvalFixtures) {
    it(`scores ${fixture.id} with the deterministic scorer`, () => {
      const result = evaluateRecommendationFixture(fixture, 'deterministic', now);

      expect(result.hitRate).toBe(1);
      for (const hit of result.hits) {
        expect(hit.matched, `${hit.fullName} should rank in top ${result.topK}`).toBe(true);
        expect(hit.reasonChecks, `${hit.fullName} reasons should match fixture`).toBe(true);
      }
      for (const check of result.suppressionChecks) {
        expect(check.matched, `${check.fullName} should be suppressed as ${check.reason}`).toBe(
          true
        );
      }
    });

    it(`scores ${fixture.id} with the hybrid RRF scorer`, () => {
      const result = evaluateRecommendationFixture(fixture, 'hybrid-rrf', now);

      expect(result.hitRate).toBe(1);
      for (const hit of result.hits) {
        expect(hit.matched, `${hit.fullName} should rank in top ${result.topK}`).toBe(true);
      }
    });
  }

  it('reports top-k hits and suppression reasons for each fixture', () => {
    for (const fixture of recommendationEvalFixtures) {
      const comparison = compareRecommendationScorers(fixture, now);
      expect(comparison.deterministic.fixtureId).toBe(fixture.id);
      expect(comparison.hybrid.fixtureId).toBe(fixture.id);
      expect(comparison.deterministic.hits.length).toBeGreaterThan(0);
      expect(comparison.deterministic.suppressed.dependencyMatches).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps hybrid ordering aligned with deterministic leaders on the CodeVetter fixture', () => {
    const fixture = recommendationEvalFixtures[0]!;
    const hybrid = buildHybridRecommendationReport(fixture.project, fixture.candidates, {
      now,
      semanticDistances: fixture.semanticDistances,
      limit: 6,
    });

    expect(hybrid.recommendations[0]?.fullName).toBe('Byron/gitoxide');
    expect(hybrid.recommendations.some((item) => item.fullName === 'promptfoo/promptfoo')).toBe(
      true
    );
  });
});
