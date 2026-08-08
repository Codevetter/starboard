import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  trackRecommendationFeedback,
  trackRecommendationSetViewed,
  trackSearchOutcome,
} from '@/lib/analytics';

describe('trackSearchOutcome', () => {
  const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(new Response(null, { status: 200 }))
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [0, 'zero'],
    [3, '1-5'],
    [6, '6-20'],
    [21, '21+'],
  ])('emits only the bucket for a result count of %i', (count, expectedBucket) => {
    trackSearchOutcome('lexical', count);

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);

    expect(body.properties).toEqual({
      project_id: 'starboard',
      surface: 'lexical',
      result_count_bucket: expectedBucket,
    });
    expect(body.properties).not.toHaveProperty('result_count_exact_capped');
  });

  it('emits categorical recommendation evidence without repository identity', () => {
    trackRecommendationFeedback({
      kind: 'tool',
      sentiment: 'useful',
      rank: 2,
      retrievalMode: 'hybrid',
      supportCount: 3,
      confidence: 94,
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.event).toBe('recommendation_feedback');
    expect(body.properties).toEqual({
      project_id: 'starboard',
      kind: 'tool',
      sentiment: 'useful',
      rank_bucket: '1-3',
      retrieval_mode: 'hybrid',
      support_bucket: 'three_plus',
      confidence_bucket: 'high',
    });
    expect(JSON.stringify(body.properties)).not.toContain('repo');
  });

  it('buckets recommendation-set size without an exact count', () => {
    trackRecommendationSetViewed('lexical-structured', 12, false);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(request.body as string);
    expect(body.properties).toEqual({
      project_id: 'starboard',
      retrieval_mode: 'lexical-structured',
      result_count_bucket: '6-20',
      fallback: false,
    });
  });
});
