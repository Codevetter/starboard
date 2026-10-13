import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
// Operator scripts use ESM so they remain independent of the application runtime.
import { scoreComparisonRuns } from '../../scripts/comparison-eval.mjs';

const fixture = {
  catalog_digest: 'frozen',
  label_validation: 'agent_provisional_not_owner_validated',
  cases: [
    {
      project: 'reader',
      candidates: [
        { repo_id: 1, expected: 'reference' },
        { repo_id: 2, expected: 'reject' },
      ],
    },
  ],
};
const fixtureHash = createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
const positive = {
  candidate_id: '1',
  verdict: 'reference',
  project_evidence: ['p'],
  candidate_evidence: ['c'],
};
describe('fixed comparison evaluation', () => {
  it('counts unavailable results as missed useful references, never as successful rejections', () => {
    const score = scoreComparisonRuns(fixture, []);
    expect(score.results.operation).toEqual({
      cases: 2,
      usefulReturned: 0,
      usefulMissed: 1,
      misleadingReturned: 0,
      misleadingRejected: 0,
      unavailable: 2,
    });
    expect(score).toMatchObject({ heldOut: false, productionLatencyVerified: false });
  });
  it('scores both pipelines against identical fixed labels', () => {
    const score = scoreComparisonRuns(fixture, [
      {
        project: 'reader',
        fixtureHash,
        catalogDigest: 'frozen',
        baseline: {
          status: 'ok',
          result: {
            items: [
              { ...positive, verdict: 'reject' },
              {
                candidate_id: '2',
                verdict: 'reference',
                project_evidence: ['p'],
                candidate_evidence: ['c'],
              },
            ],
          },
        },
        operation: {
          status: 'ok',
          result: { items: [positive, { candidate_id: '2', verdict: 'reject' }] },
        },
      },
    ]);
    expect(score.results.operation).toMatchObject({
      usefulReturned: 1,
      usefulMissed: 0,
      misleadingReturned: 0,
      misleadingRejected: 1,
      unavailable: 0,
    });
    expect(score.results.baseline).toMatchObject({ usefulMissed: 1, misleadingReturned: 1 });
  });
  it('refuses changed fixtures and uncited positive results', () => {
    expect(() =>
      scoreComparisonRuns(fixture, [
        { project: 'reader', fixtureHash: 'changed', catalogDigest: 'frozen' },
      ])
    ).toThrow('snapshot changed');
    expect(() =>
      scoreComparisonRuns(fixture, [
        {
          project: 'reader',
          fixtureHash,
          catalogDigest: 'frozen',
          operation: { status: 'ok', result: { items: [{ ...positive, project_evidence: [] }] } },
        },
      ])
    ).toThrow('no citations');
  });
});
