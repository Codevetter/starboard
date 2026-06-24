import {
  buildProjectRecommendationReport,
  type FleetProjectRecommendationReport,
  type FleetProjectSnapshot,
  type FleetRecommendation,
  type FleetRepoCandidate,
  matchesExistingDependency,
  type SemanticDistanceMap,
} from '@/lib/fleet-projects';
import { rrfFuse } from '@/lib/search';

export type RecommendationScorer = 'deterministic' | 'hybrid-rrf';

export interface RecommendationEvalExpectation {
  fullName: string;
  featureAreaId: string;
  reasonIncludes?: string[];
}

export interface SuppressionExpectation {
  fullName: string;
  reason: 'dependency' | 'archived' | 'lowSignal';
}

export interface RecommendationEvalFixture {
  id: string;
  project: FleetProjectSnapshot;
  candidates: FleetRepoCandidate[];
  semanticDistances?: SemanticDistanceMap;
  expectations: {
    topK: number;
    topRecommendations: RecommendationEvalExpectation[];
    suppressed?: SuppressionExpectation[];
  };
}

export interface RecommendationEvalHit {
  fullName: string;
  featureAreaId: string;
  rank: number;
  score: number;
  reasons: string[];
  matched: boolean;
  reasonChecks: boolean;
}

export interface RecommendationEvalResult {
  fixtureId: string;
  scorer: RecommendationScorer;
  topK: number;
  hits: RecommendationEvalHit[];
  hitRate: number;
  suppressed: {
    dependencyMatches: number;
    archived: number;
    lowSignal: number;
  };
  suppressionChecks: Array<{
    fullName: string;
    reason: SuppressionExpectation['reason'];
    matched: boolean;
  }>;
}

function recommendationKey(recommendation: FleetRecommendation): string {
  return `${recommendation.fullName}:${recommendation.featureArea.id}`;
}

function buildHybridRankedLists(
  project: FleetProjectSnapshot,
  candidates: FleetRepoCandidate[],
  semanticDistances: SemanticDistanceMap,
  now: Date
): Map<string, FleetRecommendation> {
  const deterministic = buildProjectRecommendationReport(project, candidates, {
    now,
    semanticDistances,
    limit: candidates.length,
  });

  const byKey = new Map<string, FleetRecommendation>();
  for (const recommendation of deterministic.recommendations) {
    byKey.set(recommendationKey(recommendation), recommendation);
  }

  const listsByFeature = new Map<string, number[][]>();
  for (const featureArea of project.featureAreas) {
    const featureRecommendations = deterministic.recommendations.filter(
      (item) => item.featureArea.id === featureArea.id
    );
    if (featureRecommendations.length === 0) continue;

    const byScore = [...featureRecommendations]
      .sort((a, b) => b.score - a.score)
      .map((item) => item.id);
    const byFeatureTerms = [...featureRecommendations]
      .sort((a, b) => countFeatureTerms(b) - countFeatureTerms(a) || b.score - a.score)
      .map((item) => item.id);
    const byOverlap = [...featureRecommendations]
      .sort((a, b) => countProjectOverlap(b) - countProjectOverlap(a) || b.score - a.score)
      .map((item) => item.id);
    const bySemantic = [...featureRecommendations]
      .sort(
        (a, b) =>
          semanticScore(b.semanticDistance) - semanticScore(a.semanticDistance) || b.score - a.score
      )
      .map((item) => item.id);
    const byPopularity = [...featureRecommendations]
      .sort((a, b) => b.stargazersCount - a.stargazersCount || b.score - a.score)
      .map((item) => item.id);

    listsByFeature.set(featureArea.id, [
      byScore,
      byFeatureTerms,
      byOverlap,
      bySemantic,
      byPopularity,
    ]);
  }

  const fusedOrder: FleetRecommendation[] = [];
  const seen = new Set<string>();

  for (const featureArea of project.featureAreas) {
    const lists = listsByFeature.get(featureArea.id);
    if (!lists) continue;
    const fusedIds = rrfFuse(lists);
    for (const repoId of fusedIds) {
      const recommendation = featureRecommendationsForRepo(
        deterministic.recommendations,
        featureArea.id,
        repoId
      );
      if (!recommendation) continue;
      const key = recommendationKey(recommendation);
      if (seen.has(key)) continue;
      seen.add(key);
      fusedOrder.push(recommendation);
    }
  }

  if (fusedOrder.length === 0) return byKey;

  const reranked = fusedOrder.map((recommendation, index) => ({
    ...recommendation,
    score: Math.max(recommendation.score, Math.round(100 - index * 0.5)),
  }));

  return new Map(reranked.map((item) => [recommendationKey(item), item]));
}

function featureRecommendationsForRepo(
  recommendations: FleetRecommendation[],
  featureAreaId: string,
  repoId: number
): FleetRecommendation | undefined {
  return recommendations.find(
    (item) => item.featureArea.id === featureAreaId && item.id === repoId
  );
}

function countFeatureTerms(recommendation: FleetRecommendation): number {
  return recommendation.reasons.filter((reason) => reason.startsWith('matches ')).length;
}

function countProjectOverlap(recommendation: FleetRecommendation): number {
  const overlap = recommendation.reasons.find((reason) => reason.startsWith('project overlap:'));
  if (!overlap) return 0;
  return overlap.replace('project overlap:', '').split(',').length;
}

function semanticScore(distance: number | null): number {
  if (distance === null) return 0;
  return Math.max(0, 0.72 - distance);
}

export function buildHybridRecommendationReport(
  project: FleetProjectSnapshot,
  candidates: FleetRepoCandidate[],
  options: {
    limit?: number;
    now?: Date;
    semanticDistances?: SemanticDistanceMap;
  } = {}
): FleetProjectRecommendationReport {
  const now = options.now ?? new Date();
  const semanticDistances = options.semanticDistances ?? new Map<string, number>();
  const deterministic = buildProjectRecommendationReport(project, candidates, {
    now,
    semanticDistances,
    limit: options.limit ?? 30,
  });

  const hybridRanked = buildHybridRankedLists(project, candidates, semanticDistances, now);
  const limit = options.limit ?? 30;
  const recommendations = Array.from(hybridRanked.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    ...deterministic,
    recommendations,
    summary: {
      ...deterministic.summary,
      returned: recommendations.length,
      useNow: recommendations.filter((item) => item.action === 'use-now').length,
      prototype: recommendations.filter((item) => item.action === 'prototype').length,
      research: recommendations.filter((item) => item.action === 'research').length,
    },
  };
}

function buildReportForScorer(
  scorer: RecommendationScorer,
  fixture: RecommendationEvalFixture,
  now: Date
): FleetProjectRecommendationReport {
  const semanticDistances = fixture.semanticDistances ?? new Map<string, number>();
  if (scorer === 'hybrid-rrf') {
    return buildHybridRecommendationReport(fixture.project, fixture.candidates, {
      now,
      semanticDistances,
      limit: fixture.expectations.topK,
    });
  }
  return buildProjectRecommendationReport(fixture.project, fixture.candidates, {
    now,
    semanticDistances,
    limit: fixture.expectations.topK,
  });
}

function suppressionReasonForCandidate(
  project: FleetProjectSnapshot,
  candidate: FleetRepoCandidate,
  report: FleetProjectRecommendationReport
): SuppressionExpectation['reason'] | null {
  if (matchesExistingDependency(project, candidate)) return 'dependency';
  if (candidate.archived) return 'archived';
  if (!report.recommendations.some((item) => item.id === candidate.id)) {
    return 'lowSignal';
  }
  return null;
}

export function evaluateRecommendationFixture(
  fixture: RecommendationEvalFixture,
  scorer: RecommendationScorer,
  now = new Date('2026-06-06T00:00:00Z')
): RecommendationEvalResult {
  const report = buildReportForScorer(scorer, fixture, now);
  const topK = fixture.expectations.topK;

  const hits: RecommendationEvalHit[] = fixture.expectations.topRecommendations.map(
    (expectation) => {
      const match = report.recommendations.find(
        (item) =>
          item.fullName === expectation.fullName &&
          item.featureArea.id === expectation.featureAreaId
      );
      const rank = match
        ? report.recommendations.findIndex(
            (item) =>
              item.fullName === expectation.fullName &&
              item.featureArea.id === expectation.featureAreaId
          ) + 1
        : -1;
      const reasonChecks =
        !expectation.reasonIncludes ||
        expectation.reasonIncludes.every((fragment) =>
          (match?.reasons ?? []).some((reason) => reason.includes(fragment))
        );

      return {
        fullName: expectation.fullName,
        featureAreaId: expectation.featureAreaId,
        rank,
        score: match?.score ?? 0,
        reasons: match?.reasons ?? [],
        matched: rank > 0 && rank <= topK,
        reasonChecks,
      };
    }
  );

  const suppressionChecks =
    fixture.expectations.suppressed?.map((expectation) => {
      const candidate = fixture.candidates.find((item) => item.fullName === expectation.fullName);
      if (!candidate) {
        return { ...expectation, matched: false };
      }
      const reason = suppressionReasonForCandidate(fixture.project, candidate, report);
      return {
        ...expectation,
        matched: reason === expectation.reason,
      };
    }) ?? [];

  const matchedHits = hits.filter((hit) => hit.matched && hit.reasonChecks).length;

  return {
    fixtureId: fixture.id,
    scorer,
    topK,
    hits,
    hitRate: hits.length === 0 ? 1 : matchedHits / hits.length,
    suppressed: report.suppressed,
    suppressionChecks,
  };
}

export function compareRecommendationScorers(
  fixture: RecommendationEvalFixture,
  now = new Date('2026-06-06T00:00:00Z')
): {
  deterministic: RecommendationEvalResult;
  hybrid: RecommendationEvalResult;
} {
  return {
    deterministic: evaluateRecommendationFixture(fixture, 'deterministic', now),
    hybrid: evaluateRecommendationFixture(fixture, 'hybrid-rrf', now),
  };
}
