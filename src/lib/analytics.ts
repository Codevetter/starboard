/**
 * Owner-facing analytics — the shared fleet funnel plus narrow product events.
 *
 * Every project in the fleet emits these four funnel events — `signup`,
 * `activated`, `core_action`, `returned` — so a single PostHog project can
 * build one cross-fleet funnel (signup -> activated -> core_action) and a
 * D1/D7 retention insight, with no custom dashboard.
 *
 * Every event carries `project_id: "starboard"`. Browser events use
 * `posthog-js`; server-triggered events post directly to the PostHog capture
 * API so this module stays safe in both bundles.
 */

const PROJECT = 'starboard' as const;

// Shared with foundry-monitoring.ts — same PostHog project.
const POSTHOG_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ?? 'phc_qgiAarw4Co4pw9fz3Fxj4UJaHmqzFetqs4JrXhGc35Nd';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

/**
 * The product-specific action behind a `core_action` event.
 */
export type CoreAction = 'repos_synced' | 'list_created' | 'project_connected';
export type ProjectConnectionSource = 'manual' | 'picker';
export type RecommendationKind = 'repository' | 'tool';
export type RecommendationSentiment = 'useful' | 'not_useful';
export type RecommendationRankBucket = '1-3' | '4-12' | '13+';
export type RecommendationSupportBucket = 'one' | 'two' | 'three_plus' | 'none';
export type RecommendationConfidenceBucket = 'high' | 'medium' | 'inferred' | 'none';
export type RecommendationRetrievalMode =
  | 'hybrid'
  | 'semantic'
  | 'lexical-structured'
  | 'structured'
  | 'fallback';
/**
 * The surface a search ran through. `lexical` and `semantic` are both served
 * by `/api/stars`; `semantic` covers the knowledgebase RAG path (which falls
 * back to `lexical` when RAG is unavailable).
 */
export type SearchSurface = 'lexical' | 'semantic' | 'discover';
export type SearchResultBucket = 'zero' | '1-5' | '6-20' | '21+';

interface AnalyticsEventMap {
  /** First session after an account is created. */
  signup: { project_id: typeof PROJECT };
  /** The user reaches first real value — their first successful star sync. */
  activated: { project_id: typeof PROJECT };
  /** The thing the product exists to do. */
  core_action: { project_id: typeof PROJECT; action: CoreAction };
  /** A return session by a user with prior activity. */
  returned: { project_id: typeof PROJECT };
  /** A project was durably connected without including its identity. */
  project_connected: {
    project_id: typeof PROJECT;
    source: ProjectConnectionSource;
  };
  /** A recommendation set reached the user. */
  recommendation_set_viewed: {
    project_id: typeof PROJECT;
    retrieval_mode: RecommendationRetrievalMode;
    result_count_bucket: SearchResultBucket;
    fallback: boolean;
  };
  /** A repository or tool recommendation was inspected. */
  recommendation_inspected: {
    project_id: typeof PROJECT;
    kind: RecommendationKind;
    rank_bucket: RecommendationRankBucket;
    retrieval_mode: RecommendationRetrievalMode;
  };
  /** Binary recommendation quality evidence with no repository identity. */
  recommendation_feedback: {
    project_id: typeof PROJECT;
    kind: RecommendationKind;
    sentiment: RecommendationSentiment;
    rank_bucket: RecommendationRankBucket;
    retrieval_mode: RecommendationRetrievalMode;
    support_bucket: RecommendationSupportBucket;
    confidence_bucket: RecommendationConfidenceBucket;
  };
  /**
   * Privacy-safe search activation evidence. One event per search request.
   * Carries NO query text, repo IDs, repo full names, or user identifiers —
   * only the surface and the result-count bucket. Satisfies the
   * `data-research-toolbox-automation` "Search activation evidence"
   * requirement.
   */
  search_outcome: {
    project_id: typeof PROJECT;
    surface: SearchSurface;
    result_count_bucket: SearchResultBucket;
  };
  /** A user opened a repo detail from search results. No repo identity sent. */
  result_inspection: { project_id: typeof PROJECT; surface: 'repo_detail' };
}

function emitServer(event: string, props: Record<string, unknown>, distinctId?: string): void {
  void fetch(`${POSTHOG_HOST}/i/v0/e/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      distinct_id: distinctId ?? `${PROJECT}-server`,
      properties: props,
    }),
  }).catch(() => {
    // Analytics must never block or break a server action.
  });
}

export function trackEvent(
  event: string,
  properties: Record<string, unknown> = {},
  distinctId?: string
): void {
  const payload = { project_id: PROJECT, ...properties };
  try {
    if (typeof window === 'undefined') {
      emitServer(event, payload, distinctId);
    } else {
      // Browser context. Load the browser client lazily so the React-dependent
      // `posthog-js` entry is never evaluated during SSR.
      void import('posthog-js')
        .then(({ default: posthog }) => {
          posthog.capture(event, payload);
        })
        .catch(() => {
          // Analytics must never break a user flow. Swallow and move on.
        });
    }
  } catch {
    // Analytics must never break a user flow. Swallow and move on.
  }
}

function emit<K extends keyof AnalyticsEventMap>(
  event: K,
  props: Omit<AnalyticsEventMap[K], 'project_id'>,
  distinctId?: string
): void {
  trackEvent(event, props, distinctId);
}

/** Fire once, on the first session after an account is created. */
export function trackSignup(): void {
  emit('signup', {});
}

/** Fire once, when the user first reaches real value (first star sync). */
export function trackActivated(distinctId?: string): void {
  emit('activated', {}, distinctId);
}

/** Fire on each completion of the core product action. */
export function trackCoreAction(action: CoreAction, distinctId?: string): void {
  emit('core_action', { action }, distinctId);
}

/** Fire on session start for a user who has prior activity. */
export function trackReturned(): void {
  emit('returned', {});
}

export function trackProjectConnected(source: ProjectConnectionSource, distinctId?: string): void {
  emit('project_connected', { source }, distinctId);
  trackCoreAction('project_connected', distinctId);
}

function resultCountBucket(resultCount: number): SearchResultBucket {
  return resultCount === 0 ? 'zero' : resultCount <= 5 ? '1-5' : resultCount <= 20 ? '6-20' : '21+';
}

export function recommendationRankBucket(rank: number): RecommendationRankBucket {
  return rank <= 3 ? '1-3' : rank <= 12 ? '4-12' : '13+';
}

export function trackRecommendationSetViewed(
  retrievalMode: RecommendationRetrievalMode,
  resultCount: number,
  fallback: boolean
): void {
  emit('recommendation_set_viewed', {
    retrieval_mode: retrievalMode,
    result_count_bucket: resultCountBucket(resultCount),
    fallback,
  });
}

export function trackRecommendationInspected(
  kind: RecommendationKind,
  rank: number,
  retrievalMode: RecommendationRetrievalMode
): void {
  emit('recommendation_inspected', {
    kind,
    rank_bucket: recommendationRankBucket(rank),
    retrieval_mode: retrievalMode,
  });
}

export function trackRecommendationFeedback(input: {
  kind: RecommendationKind;
  sentiment: RecommendationSentiment;
  rank: number;
  retrievalMode: RecommendationRetrievalMode;
  supportCount?: number;
  confidence?: number;
}): void {
  const support = input.supportCount ?? 0;
  const confidence = input.confidence ?? 0;
  emit('recommendation_feedback', {
    kind: input.kind,
    sentiment: input.sentiment,
    rank_bucket: recommendationRankBucket(input.rank),
    retrieval_mode: input.retrievalMode,
    support_bucket:
      support <= 0 ? 'none' : support === 1 ? 'one' : support === 2 ? 'two' : 'three_plus',
    confidence_bucket:
      confidence <= 0
        ? 'none'
        : confidence >= 90
          ? 'high'
          : confidence >= 65
            ? 'medium'
            : 'inferred',
  });
}

/**
 * Fire one aggregate `search_outcome` event per search request. Carries NO
 * query text, repo IDs, repo full names, or user identifiers — only the
 * surface and the result-count bucket. Exact counts are never emitted.
 */
export function trackSearchOutcome(surface: SearchSurface, resultCount: number): void {
  emit('search_outcome', {
    surface,
    result_count_bucket: resultCountBucket(resultCount),
  });
}

/** Fire when a user opens a repo detail from search results. No repo identity sent. */
export function trackResultInspection(): void {
  emit('result_inspection', { surface: 'repo_detail' });
}
