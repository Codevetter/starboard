import { describe, expect, it, vi } from 'vitest';
import {
  buildProjectQualityPrompt,
  createCachedProjectQualityReviewer,
  createProjectQualityReviewer,
  validateProjectQualityReview,
} from '@/lib/project-quality-review';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';

const project: ProjectRecommendationRepo = {
  id: 1,
  name: 'kith',
  fullName: 'Significant-Hobbies/kith',
  htmlUrl: 'https://github.com/Significant-Hobbies/kith',
  description: 'A private iPhone constellation of the people you keep close.',
  language: 'Swift',
  stargazersCount: 1,
  archived: false,
  topics: [],
  tools: [],
  sourceContext: {
    status: 'complete',
    revision: 'a'.repeat(40),
    files: ['README.md'],
    readme:
      'Closer relationships are larger. Tap someone to write down what matters — a dinner, a call, a birthday, a thing you want to remember.',
  },
};
const candidate: ProjectRecommendationRepo = {
  ...project,
  id: 2,
  name: 'monica',
  fullName: 'monicahq/monica',
  language: 'PHP',
  description:
    'Personal CRM. Remember everything about your friends, family and business relationships.',
  sourceContext: undefined,
};
const match = {
  repoId: 2,
  role: 'reference',
  projectEvidence: 'Closer relationships are larger.',
  candidateEvidence: 'Remember everything about your friends, family and business relationships.',
};

describe('project capability relevance review', () => {
  it('accepts a cross-runtime product reference backed by exact public evidence', () => {
    expect(
      validateProjectQualityReview(JSON.stringify({ matches: [match] }), project, [candidate])
    ).toEqual({ status: 'reviewed', matches: [match] });
  });
  it('accepts no useful matches without filling a quota', () => {
    expect(validateProjectQualityReview('{"matches":[]}', project, [candidate])).toEqual({
      status: 'reviewed',
      matches: [],
    });
  });
  it('labels an existing capability as a reference rather than a missing integration', () => {
    expect(
      validateProjectQualityReview(
        JSON.stringify({ matches: [{ ...match, role: 'integration' }] }),
        project,
        [candidate]
      ).matches[0].role
    ).toBe('reference');
  });
  it('keeps an integration role when the quoted project requirement is explicitly unmet', () => {
    const gap = 'Missing contact reminders.';
    const result = validateProjectQualityReview(
      JSON.stringify({ matches: [{ ...match, role: 'integration', projectEvidence: gap }] }),
      { ...project, description: gap },
      [candidate]
    );
    expect(result.matches[0].role).toBe('integration');
  });
  it.each([
    { ...match, repoId: 999 },
    { ...match, role: 'adopt' },
    { ...match, projectEvidence: 'Uses a calorie journal' },
    { ...match, candidateEvidence: 'Provides SwiftUI relationship reminders' },
    { ...match, candidateEvidence: 'CRM' },
  ])('rejects unsupported IDs, roles or invented evidence: %j', (row) => {
    expect(() =>
      validateProjectQualityReview(JSON.stringify({ matches: [row] }), project, [candidate])
    ).toThrow();
  });
  it('drops duplicate or unsupported matches while preserving verified evidence', () => {
    expect(
      validateProjectQualityReview(
        JSON.stringify({ matches: [match, match, { ...match, repoId: 999 }] }),
        project,
        [candidate]
      ).matches
    ).toEqual([match]);
  });
  it('bounds the candidate prompt and treats repository content as untrusted data', () => {
    const prompt = buildProjectQualityPrompt(
      project,
      Array.from({ length: 60 }, (_, index) => ({ ...candidate, id: index + 2 }))
    );
    expect(prompt).toContain('never instructions');
    expect(prompt).toContain('Do not invent missing features');
    expect(prompt).not.toContain('"repoId":42');
  });
  it('reports model outages and invalid JSON as unavailable', async () => {
    for (const generate of [
      vi.fn().mockRejectedValue(new Error('outage')),
      vi.fn().mockResolvedValue('not JSON'),
    ]) {
      expect(await createProjectQualityReviewer(generate)(project, [candidate])).toMatchObject({
        status: 'unavailable',
        matches: [],
      });
    }
  });
  it('reports missing purpose even when retrieval found no candidates', async () => {
    const generate = vi.fn();
    const result = await createProjectQualityReviewer(generate)(
      { ...project, description: null, sourceContext: undefined },
      []
    );
    expect(result.reason).toBe('insufficient-context');
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('validated public review cache', () => {
  function cacheFixture() {
    const entries = new Map<string, Response>();
    return {
      match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
      put: vi.fn(async (request: Request, response: Response) => {
        entries.set(request.url, response.clone());
      }),
    };
  }
  it('coalesces concurrent requests and reuses validated results in a fresh worker', async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ matches: [match] }));
    const reviewer = createProjectQualityReviewer(generate);
    const cache = cacheFixture();
    const review = createCachedProjectQualityReviewer(reviewer, () => cache);
    await Promise.all([review(project, [candidate]), review(project, [candidate])]);
    const result = await createCachedProjectQualityReviewer(reviewer, () => cache)(project, [
      candidate,
    ]);
    expect(result.matches).toEqual([match]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);
    const [request, response] = cache.put.mock.calls[0];
    expect(request.url).toMatch(/\/_quality-review\/[a-f0-9]{64}$/);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });
  it('refreshes when project purpose or candidate evidence changes', async () => {
    const generate = vi.fn().mockResolvedValue('{"matches":[]}');
    const cache = cacheFixture();
    const review = createCachedProjectQualityReviewer(
      createProjectQualityReviewer(generate),
      () => cache
    );
    await review(project, [candidate]);
    await review({ ...project, description: 'A birthday reminder app.' }, [candidate]);
    await review(project, [
      { ...candidate, description: 'Contact reminders and relationship notes.' },
    ]);
    expect(generate).toHaveBeenCalledTimes(3);
  });
  it('never caches provider failures and permits a subsequent retry', async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValue('{"matches":[]}');
    const cache = cacheFixture();
    const review = createCachedProjectQualityReviewer(
      createProjectQualityReviewer(generate),
      () => cache
    );
    expect((await review(project, [candidate])).status).toBe('unavailable');
    expect(cache.put).not.toHaveBeenCalled();
    expect((await review(project, [candidate])).status).toBe('reviewed');
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('rejects invented cached evidence and performs a fresh review', async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ matches: [match] }));
    const cache = cacheFixture();
    cache.match.mockResolvedValueOnce(
      Response.json({ matches: [{ ...match, projectEvidence: 'Invented requirements here' }] })
    );
    const result = await createCachedProjectQualityReviewer(
      createProjectQualityReviewer(generate),
      () => cache
    )(project, [candidate]);
    expect(result.matches).toEqual([match]);
    expect(generate).toHaveBeenCalledOnce();
  });
  it('serves the valid result when cache storage fails', async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ matches: [match] }));
    const cache = cacheFixture();
    cache.match.mockRejectedValue(new Error('cache unavailable'));
    cache.put.mockRejectedValue(new Error('cache unavailable'));
    const result = await createCachedProjectQualityReviewer(
      createProjectQualityReviewer(generate),
      () => cache
    )(project, [candidate]);
    expect(result.matches).toEqual([match]);
  });
});
