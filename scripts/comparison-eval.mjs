import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

function scoreCandidate(score, candidate, items) {
  score.cases++;
  const matches = items?.filter((item) => item.candidate_id === String(candidate.repo_id));
  const item = matches?.length === 1 ? matches[0] : undefined;
  const available = !!item && ['reference', 'reject'].includes(item.verdict);
  const accepted = available && item.verdict === 'reference';
  if (accepted && (!item.project_evidence?.length || !item.candidate_evidence?.length))
    throw new Error('Accepted evaluation case has no citations');
  if (!available) score.unavailable++;
  if (candidate.expected === 'reference') {
    if (accepted) score.usefulReturned++;
    else score.usefulMissed++;
  } else if (candidate.expected === 'reject') {
    if (accepted) score.misleadingReturned++;
    else if (available) score.misleadingRejected++;
  } else throw new Error('Unknown evaluation label');
}

export function scoreComparisonRuns(fixture, records) {
  const fixtureHash = createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
  const results = {};
  for (const engine of ['baseline', 'operation']) {
    const score = {
      cases: 0,
      usefulReturned: 0,
      usefulMissed: 0,
      misleadingReturned: 0,
      misleadingRejected: 0,
      unavailable: 0,
    };
    for (const testCase of fixture.cases) {
      const record = records.find((row) => row.project === testCase.project);
      if (
        record &&
        (record.fixtureHash !== fixtureHash || record.catalogDigest !== fixture.catalog_digest)
      )
        throw new Error('Evaluation fixture or catalog snapshot changed');
      const result = record?.[engine];
      const items = result?.status === 'ok' ? result.result?.items : undefined;
      for (const candidate of testCase.candidates) scoreCandidate(score, candidate, items);
    }
    results[engine] = score;
  }
  return {
    fixtureHash,
    labelValidation: fixture.label_validation,
    heldOut: false,
    productionLatencyVerified: false,
    results,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const [fixturePath, directory] = process.argv.slice(2);
  if (!fixturePath || !directory)
    throw new Error('Usage: node scripts/comparison-eval.mjs <fixture.json> <run-directory>');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const records = [];
  for (const testCase of fixture.cases) {
    try {
      records.push(
        JSON.parse(
          await readFile(resolve(directory, `paired-v32-${testCase.project}.json`), 'utf8')
        )
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  console.log(JSON.stringify(scoreComparisonRuns(fixture, records), null, 2));
}
