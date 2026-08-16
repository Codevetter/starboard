import { describe, expect, it, vi } from 'vitest';

import type { DbClient, DbResult, InStatement } from '@/db/client';
import {
  capabilitySourceFingerprint,
  computeProjectFingerprint,
  createNeedDrivenIntelligence,
  createExternalReviewRequest,
  evaluateNewCatalogAdditions,
  extractNeeds,
  fingerprintTexts,
  ingestExternalReview,
  loadLatestDraftReport,
  loadLatestReviewedReport,
  mergeNeeds,
  needSignature,
  rejectUnsupportedNeeds,
  reviewIdempotencyKey,
  reviewRequestHash,
  type CandidateClassification,
  type ExternalReviewResult,
  type NeedDrivenIntelligenceDependencies,
  type ProjectNeed,
} from '@/lib/need-driven-intelligence';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dbResult(
  rows: Record<string, unknown>[] = [],
  overrides: Partial<DbResult> = {}
): DbResult {
  return {
    rows,
    columns: [],
    rowsAffected: 0,
    lastInsertRowid: rows.length > 0 ? 1 : null,
    ...overrides,
  };
}

function project(overrides: Partial<ProjectRecommendationRepo> = {}): ProjectRecommendationRepo {
  return {
    id: 1,
    name: 'checkout',
    fullName: 'acme/checkout',
    htmlUrl: 'https://github.com/acme/checkout',
    description: 'Payments orchestration for TypeScript services with OAuth sign-in',
    language: 'TypeScript',
    stargazersCount: 20,
    archived: false,
    topics: ['payments', 'cloudflare', 'ai'],
    aiSummary: 'AI-powered payments orchestration with LLM inference',
    aiCategory: 'fintech',
    aiKeywords: ['payments', 'llm', 'oauth'],
    tools: [
      { key: 'next', name: 'Next.js', category: 'framework', confidence: 90 },
      { key: 'cloudflare', name: 'Cloudflare', category: 'cloud', confidence: 85 },
    ],
    ...overrides,
  };
}

function candidateRow(
  id: number,
  fullName: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    name: fullName.split('/')[1],
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
    description: 'Payments toolkit with TypeScript and Cloudflare Workers',
    language: 'TypeScript',
    stargazers_count: 15_000,
    archived: 0,
    topics: '["payments","cloudflare","ai"]',
    ai_summary: 'AI payments orchestration',
    ai_category: 'fintech',
    ai_keywords: '["payments","llm"]',
    tools: '[]',
    ...overrides,
  };
}

function makeDependencies(
  execute: (statement: string | InStatement) => Promise<DbResult>,
  batch?: (statements: InStatement[]) => Promise<DbResult[]>,
  vectorOverrides: Partial<ReturnType<NeedDrivenIntelligenceDependencies['vectorStore']>> = {}
): NeedDrivenIntelligenceDependencies {
  return {
    database: {
      execute,
      batch: batch ?? (vi.fn(async () => [dbResult()]) as unknown as DbClient['batch']),
    },
    vectorStore: () => ({
      query: vi.fn().mockResolvedValue([]),
      queryByRepoId: vi.fn().mockResolvedValue([]),
      ...vectorOverrides,
    }),
    embed: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  };
}

// ---------------------------------------------------------------------------
// Fingerprinting tests
// ---------------------------------------------------------------------------

describe('fingerprintTexts', () => {
  it('produces stable SHA-256 hex fingerprints for identical inputs', () => {
    const a = fingerprintTexts(['hello', 'world']);
    const b = fingerprintTexts(['hello', 'world']);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different fingerprints when inputs differ', () => {
    const a = fingerprintTexts(['hello', 'world']);
    const b = fingerprintTexts(['hello', 'changed']);
    expect(a).not.toBe(b);
  });

  it('handles null and undefined inputs deterministically', () => {
    const a = fingerprintTexts([null, undefined, '']);
    const b = fingerprintTexts([null, undefined, '']);
    expect(a).toBe(b);
  });
});

describe('capabilitySourceFingerprint', () => {
  it('changes when tool keys change', () => {
    const base = {
      fullName: 'acme/repo',
      description: 'desc',
      language: 'TypeScript',
      topics: ['a'],
      aiSummary: null,
      aiCategory: null,
      aiKeywords: [],
      toolKeys: ['react'],
    };
    const a = capabilitySourceFingerprint(base);
    const b = capabilitySourceFingerprint({ ...base, toolKeys: ['react', 'vite'] });
    expect(a).not.toBe(b);
  });

  it('is stable when topic order changes but content is the same', () => {
    const base = {
      fullName: 'acme/repo',
      description: 'desc',
      language: 'TypeScript',
      topics: ['a', 'b'],
      aiSummary: null,
      aiCategory: null,
      aiKeywords: [],
      toolKeys: [],
    };
    const a = capabilitySourceFingerprint(base);
    const b = capabilitySourceFingerprint({ ...base, topics: ['b', 'a'] });
    expect(a).toBe(b);
  });
});

describe('needSignature', () => {
  it('produces stable signatures for identical needs', () => {
    const need = {
      title: 'Test need',
      searchIntents: ['intent one', 'intent two'],
      constraints: ['must work'],
    };
    expect(needSignature(need)).toBe(needSignature(need));
  });

  it('produces different signatures when search intents differ', () => {
    const base = {
      title: 'Test need',
      searchIntents: ['intent one'],
      constraints: [],
    };
    expect(needSignature(base)).not.toBe(needSignature({ ...base, searchIntents: ['intent two'] }));
  });
});

// ---------------------------------------------------------------------------
// Need extraction tests
// ---------------------------------------------------------------------------

describe('extractNeeds', () => {
  it('extracts multiple evidence-backed needs from a project with rich metadata', () => {
    const needs = extractNeeds(project());
    expect(needs.length).toBeGreaterThanOrEqual(3);
    expect(needs.length).toBeLessThanOrEqual(10);
    for (const need of needs) {
      expect(need.evidence.length).toBeGreaterThanOrEqual(1);
      expect(need.signature).toMatch(/^[0-9a-f]{64}$/);
      expect(need.id).toContain('1-');
    }
  });

  it('returns a single fallback need when evidence is insufficient', () => {
    const needs = extractNeeds(
      project({
        description: null,
        topics: [],
        aiSummary: null,
        aiCategory: null,
        aiKeywords: [],
        tools: [],
        language: null,
      })
    );
    expect(needs).toHaveLength(1);
    expect(needs[0].priority).toBe('low');
    expect(needs[0].evidence.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts the AI inference need when AI/LLM keywords are present', () => {
    const needs = extractNeeds(project({ topics: ['ai', 'llm'] }));
    const aiNeed = needs.find((n) => n.id.includes('ai-inference-runtime'));
    expect(aiNeed).toBeDefined();
    expect(aiNeed?.priority).toBe('high');
  });

  it('extracts the edge/serverless need when Cloudflare is present', () => {
    const needs = extractNeeds(project({ topics: ['cloudflare', 'workers'] }));
    const edgeNeed = needs.find((n) => n.id.includes('edge-serverless-primitives'));
    expect(edgeNeed).toBeDefined();
  });

  it('does not exceed MAX_NEEDS', () => {
    const needs = extractNeeds(
      project({
        description:
          'ai llm model cloudflare worker d1 pages embed vector semantic eval benchmark auth oauth sign-in landing marketing seo log observability sentry ci cd pipeline migration schema',
        topics: ['ai', 'cloudflare', 'embed', 'eval', 'auth', 'seo', 'log', 'ci', 'migration'],
        aiKeywords: ['llm', 'vector', 'benchmark', 'oauth', 'observability', 'pipeline', 'schema'],
      })
    );
    expect(needs.length).toBeLessThanOrEqual(10);
  });
});

describe('mergeNeeds', () => {
  it('deduplicates needs with the same signature, keeping higher priority', () => {
    const need: ProjectNeed = {
      id: '1-test',
      title: 'Test need',
      currentState: 'state',
      desiredOutcome: 'outcome',
      priority: 'low',
      constraints: [],
      evidence: ['evidence'],
      searchIntents: ['intent'],
      signature: 'same-sig',
    };
    const higher: ProjectNeed = { ...need, priority: 'high' };
    const merged = mergeNeeds([need, higher]);
    expect(merged).toHaveLength(1);
    expect(merged[0].priority).toBe('high');
  });

  it('sorts by priority weight (high first)', () => {
    const base = {
      id: '1-test',
      title: 'Test',
      currentState: 's',
      desiredOutcome: 'o',
      constraints: [],
      evidence: ['e'],
      searchIntents: ['i'],
      signature: '',
    };
    const low: ProjectNeed = { ...base, id: 'low', priority: 'low', signature: 'sig-low' };
    const high: ProjectNeed = { ...base, id: 'high', priority: 'high', signature: 'sig-high' };
    const merged = mergeNeeds([low, high]);
    expect(merged[0].priority).toBe('high');
  });
});

describe('rejectUnsupportedNeeds', () => {
  it('retains needs with evidence and rejects those without', () => {
    const supported: ProjectNeed = {
      id: '1-supported',
      title: 'Supported',
      currentState: 's',
      desiredOutcome: 'o',
      priority: 'high',
      constraints: [],
      evidence: ['evidence'],
      searchIntents: ['i'],
      signature: 'sig-1',
    };
    const unsupported: ProjectNeed = {
      ...supported,
      id: '1-unsupported',
      evidence: [],
      signature: 'sig-2',
    };
    const { retained, rejected } = rejectUnsupportedNeeds([supported, unsupported]);
    expect(retained).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(retained[0].id).toBe('1-supported');
  });
});

// ---------------------------------------------------------------------------
// Classification tests (via pipeline)
// ---------------------------------------------------------------------------

describe('need-driven pipeline classification', () => {
  it('classifies a strong matching candidate as adopt_or_integrate', async () => {
    const execute = vi.fn(async (statement: string | { sql: string; args?: unknown[] }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.includes('repos_fts MATCH')) return dbResult([{ id: 10 }]);
      if (sql.includes('r.language = ? COLLATE NOCASE')) return dbResult([{ id: 10 }]);
      if (sql.includes('json_each(?)')) {
        return dbResult([
          candidateRow(10, 'oss/payments-kit', {
            topics: '["payments","cloudflare","ai"]',
            tools:
              '[{"key":"next","name":"Next.js","category":"framework","confidence":90},{"key":"cloudflare","name":"Cloudflare","category":"cloud","confidence":85}]',
          }),
        ]);
      }
      if (sql.includes('SELECT fingerprint FROM project_fingerprints')) return dbResult();
      if (sql.includes('SELECT need_id, title')) return dbResult();
      if (sql.includes('SELECT DISTINCT signature FROM project_needs')) return dbResult();
      if (sql.includes('SELECT candidate_ids FROM need_candidate_pools')) return dbResult();
      if (sql.includes('SELECT source_fingerprint FROM repo_capability_cards')) return dbResult();
      if (sql.includes('SELECT r.id, r.full_name, r.description')) return dbResult();
      if (sql.includes('SELECT id, full_name, description, language, topics')) return dbResult();
      if (sql.includes('INSERT INTO project_fingerprints')) return dbResult();
      if (sql.includes('DELETE FROM project_needs')) return dbResult();
      if (sql.includes('INSERT INTO project_needs')) return dbResult();
      if (sql.includes('INSERT INTO repo_capability_cards')) return dbResult();
      if (sql.includes('INSERT INTO need_candidate_pools')) return dbResult();
      if (sql.includes('UPDATE project_draft_reports')) return dbResult();
      if (sql.includes('INSERT INTO project_draft_reports'))
        return dbResult([], { rowsAffected: 1, lastInsertRowid: 1 });
      return dbResult();
    });
    const deps = makeDependencies(execute, undefined, {
      query: vi.fn().mockResolvedValue([{ repoId: 10, distance: 0.3 }]),
    });
    const run = createNeedDrivenIntelligence(deps);
    const report = await run(project());

    expect(report.status).toBe('complete');
    expect(report.needs.length).toBeGreaterThan(0);
    const firstNeed = report.needs[0];
    expect(firstNeed.candidates.length).toBeGreaterThan(0);
    const adoptCandidate = firstNeed.candidates.find(
      (c) => c.classification === 'adopt_or_integrate'
    );
    expect(adoptCandidate).toBeDefined();
  });

  it('classifies an archived candidate as unsuitable_negative_example', async () => {
    const execute = vi.fn(async (statement: string | { sql: string; args?: unknown[] }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.includes('repos_fts MATCH')) return dbResult([{ id: 20 }]);
      if (sql.includes('r.language = ? COLLATE NOCASE')) return dbResult([{ id: 20 }]);
      if (sql.includes('json_each(?)')) {
        return dbResult([
          candidateRow(20, 'oss/archived-payments', {
            archived: 1,
            topics: '["payments"]',
            stargazers_count: 100,
          }),
        ]);
      }
      if (sql.includes('SELECT fingerprint FROM project_fingerprints')) return dbResult();
      if (sql.includes('SELECT need_id, title')) return dbResult();
      if (sql.includes('SELECT DISTINCT signature FROM project_needs')) return dbResult();
      if (sql.includes('SELECT candidate_ids FROM need_candidate_pools')) return dbResult();
      if (sql.includes('SELECT source_fingerprint FROM repo_capability_cards')) return dbResult();
      if (sql.includes('INSERT')) return dbResult();
      if (sql.includes('DELETE')) return dbResult();
      if (sql.includes('UPDATE')) return dbResult();
      return dbResult();
    });
    const deps = makeDependencies(execute, undefined, {
      query: vi.fn().mockResolvedValue([{ repoId: 20, distance: 0.4 }]),
    });
    const run = createNeedDrivenIntelligence(deps);
    const report = await run(project());

    const allCandidates = report.needs.flatMap((n) => n.candidates);
    // Archived candidates should be classified as unsuitable
    const unsuitable = allCandidates.find(
      (c) => c.classification === 'unsuitable_negative_example'
    );
    expect(unsuitable).toBeDefined();
  });

  it('marks the report as degraded when semantic retrieval fails', async () => {
    const execute = vi.fn(async (statement: string | { sql: string }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.includes('repos_fts MATCH')) return dbResult([{ id: 30 }]);
      if (sql.includes('r.language = ? COLLATE NOCASE')) return dbResult([{ id: 30 }]);
      if (sql.includes('json_each(?)')) {
        return dbResult([candidateRow(30, 'oss/lexical-only', { topics: '["payments"]' })]);
      }
      if (sql.includes('SELECT fingerprint')) return dbResult();
      if (sql.includes('SELECT need_id')) return dbResult();
      if (sql.includes('SELECT DISTINCT signature')) return dbResult();
      if (sql.includes('SELECT candidate_ids')) return dbResult();
      if (sql.includes('SELECT source_fingerprint')) return dbResult();
      if (sql.includes('INSERT')) return dbResult();
      if (sql.includes('DELETE')) return dbResult();
      if (sql.includes('UPDATE')) return dbResult();
      return dbResult();
    });
    const deps = makeDependencies(execute, undefined, {
      query: vi.fn().mockRejectedValue(new Error('Vectorize unavailable')),
    });
    const run = createNeedDrivenIntelligence(deps);
    const report = await run(project());

    expect(report.status).toBe('degraded');
    const modes = report.needs.map((n) => n.retrievalMode);
    expect(modes.some((m) => m === 'lexical-structured' || m === 'fallback')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Draft report persistence tests
// ---------------------------------------------------------------------------

describe('draft report persistence', () => {
  it('persists a draft report and loads it back', async () => {
    const storedReports: Record<number, string> = {};
    const execute = vi.fn(async (statement: string | { sql: string; args?: unknown[] }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);
      if (sql.includes('UPDATE project_draft_reports SET is_latest = 0')) return dbResult();
      if (sql.includes('INSERT INTO project_draft_reports')) {
        storedReports[Number(args[0])] = String(args[5]);
        return dbResult([], { rowsAffected: 1, lastInsertRowid: 42 });
      }
      if (sql.includes('SELECT report FROM project_draft_reports')) {
        const repoId = Number(args[0]);
        return storedReports[repoId] ? dbResult([{ report: storedReports[repoId] }]) : dbResult();
      }
      return dbResult();
    });
    const deps = makeDependencies(execute);
    const run = createNeedDrivenIntelligence(deps);
    const report = await run(project());

    const loaded = await loadLatestDraftReport(project().id, deps);
    expect(loaded).not.toBeNull();
    expect(loaded?.repoId).toBe(report.repoId);
    expect(loaded?.fingerprint).toBe(report.fingerprint);
  });
});

// ---------------------------------------------------------------------------
// External review contract tests
// ---------------------------------------------------------------------------

describe('external review contract', () => {
  it('creates a review request with a stable idempotency key', async () => {
    const execute = vi.fn(async (statement: string | { sql: string; args?: unknown[] }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.includes('SELECT id, status FROM external_review_requests')) return dbResult();
      if (sql.includes('INSERT INTO external_review_requests')) return dbResult();
      return dbResult();
    });
    const deps = makeDependencies(execute);

    const draftReport = {
      repoId: 1,
      fingerprint: 'abc',
      catalogGeneration: '2026-01-01',
      retrievalVersion: 'v1',
      status: 'complete' as const,
      needs: [],
      needsCount: 0,
      candidatesCount: 0,
      provenance: [],
      createdAt: '2026-01-01T00:00:00Z',
    };

    const { request, created } = await createExternalReviewRequest(1, 42, draftReport, deps);
    expect(created).toBe(true);
    expect(request.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(request.status).toBe('pending');
  });

  it('returns the existing request when the idempotency key matches', async () => {
    const execute = vi.fn(async (statement: string | { sql: string; args?: unknown[] }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);
      if (sql.includes('SELECT id, status FROM external_review_requests')) {
        return dbResult([{ id: 99, status: 'pending' }]);
      }
      return dbResult();
    });
    const deps = makeDependencies(execute);

    const draftReport = {
      repoId: 1,
      fingerprint: 'abc',
      catalogGeneration: '2026-01-01',
      retrievalVersion: 'v1',
      status: 'complete' as const,
      needs: [],
      needsCount: 0,
      candidatesCount: 0,
      provenance: [],
      createdAt: '2026-01-01T00:00:00Z',
    };

    const { created } = await createExternalReviewRequest(1, 42, draftReport, deps);
    expect(created).toBe(false);
  });

  it('ingests a review result idempotently', async () => {
    let reviewCompleted = false;
    const execute = vi.fn(async (statement: string | { sql: string; args?: unknown[] }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.includes('SELECT id, status FROM external_review_requests WHERE idempotency_key')) {
        if (!reviewCompleted) {
          return dbResult([{ id: 10, status: 'pending' }]);
        }
        return dbResult([{ id: 10, status: 'complete' }]);
      }
      if (sql.includes('SELECT id FROM project_reviewed_reports WHERE review_request_id')) {
        return dbResult([{ id: 55 }]);
      }
      if (sql.includes('SELECT repo_id, draft_report_id FROM external_review_requests WHERE id')) {
        return dbResult([{ repo_id: 1, draft_report_id: 42 }]);
      }
      if (sql.includes('SELECT report FROM project_draft_reports WHERE id')) {
        return dbResult([
          {
            report: JSON.stringify({
              repoId: 1,
              fingerprint: 'abc',
              catalogGeneration: '2026-01-01',
              retrievalVersion: 'v1',
              status: 'complete',
              needs: [
                {
                  need: {
                    id: '1-ai-inference-runtime',
                    title: 'AI inference',
                    currentState: 's',
                    desiredOutcome: 'o',
                    priority: 'high',
                    constraints: [],
                    evidence: ['e'],
                    searchIntents: ['i'],
                    signature: 'sig',
                  },
                  candidates: [
                    {
                      repoId: 100,
                      fullName: 'oss/repo',
                      htmlUrl: 'https://github.com/oss/repo',
                      description: 'desc',
                      language: 'TypeScript',
                      stargazersCount: 1000,
                      archived: false,
                      topics: [],
                      tools: [],
                      classification: 'adopt_or_integrate',
                      confidence: 'high',
                      evidence: ['e'],
                      score: 30,
                    },
                  ],
                  retrievalMode: 'hybrid',
                },
              ],
              needsCount: 1,
              candidatesCount: 1,
              provenance: [],
              createdAt: '2026-01-01T00:00:00Z',
            }),
          },
        ]);
      }
      if (sql.includes('UPDATE project_reviewed_reports SET is_latest')) return dbResult();
      if (sql.includes('INSERT INTO project_reviewed_reports')) {
        return dbResult([], { rowsAffected: 1, lastInsertRowid: 55 });
      }
      if (sql.includes('UPDATE external_review_requests')) {
        reviewCompleted = true;
        return dbResult();
      }
      return dbResult();
    });
    const deps = makeDependencies(execute);

    const reviewResult: ExternalReviewResult = {
      idempotencyKey: reviewIdempotencyKey(
        1,
        reviewRequestHash({
          repoId: 1,
          fingerprint: 'abc',
          catalogGeneration: '2026-01-01',
          retrievalVersion: 'v1',
          status: 'complete',
          needs: [],
          needsCount: 0,
          candidatesCount: 0,
          provenance: [],
          createdAt: '2026-01-01T00:00:00Z',
        })
      ),
      reviewerProvider: 'devin',
      reviewerModel: 'devin-1',
      reviewerUsage: { tokens: 5000 },
      verdicts: [
        {
          needId: '1-ai-inference-runtime',
          verdict: 'supported',
          rationale: 'Need is well-supported',
          rejectedCandidateIds: [100],
        },
      ],
    };

    const result = await ingestExternalReview(reviewResult, deps);
    expect(result.created).toBe(true);
    expect(result.reviewedReportId).toBe(55);

    // Second submission should be idempotent
    const result2 = await ingestExternalReview(reviewResult, deps);
    expect(result2.created).toBe(false);
    expect(result2.reviewedReportId).toBe(55);
  });

  it('throws when no matching review request exists', async () => {
    const execute = vi.fn(async () => dbResult());
    const deps = makeDependencies(execute);

    const reviewResult: ExternalReviewResult = {
      idempotencyKey: 'nonexistent',
      reviewerProvider: 'devin',
      reviewerModel: 'devin-1',
      reviewerUsage: {},
      verdicts: [],
    };

    await expect(ingestExternalReview(reviewResult, deps)).rejects.toThrow(
      'No matching external review request'
    );
  });
});

// ---------------------------------------------------------------------------
// Incremental evaluation tests
// ---------------------------------------------------------------------------

describe('evaluateNewCatalogAdditions', () => {
  it('returns need signatures that match new repos', async () => {
    const execute = vi.fn(async (statement: string | { sql: string; args?: unknown[] }) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);
      if (sql.includes('SELECT DISTINCT signature FROM project_needs')) {
        return dbResult([{ signature: 'sig-ai' }, { signature: 'sig-auth' }]);
      }
      if (sql.includes('SELECT r.full_name, r.description, r.language, r.topics')) {
        return dbResult([
          {
            full_name: 'oss/llm-runtime',
            description: 'Local LLM inference engine',
            language: 'Python',
            topics: '["ai","llm"]',
            summary: null,
            category: null,
            keywords: null,
          },
        ]);
      }
      if (sql.includes('SELECT DISTINCT signature, search_intents FROM project_needs')) {
        return dbResult([
          {
            signature: 'sig-ai',
            search_intents: '["local LLM inference engine","edge AI runtime"]',
          },
          { signature: 'sig-auth', search_intents: '["oauth2 pkce library"]' },
        ]);
      }
      return dbResult();
    });
    const deps = makeDependencies(execute);

    const triggered = await evaluateNewCatalogAdditions([100], deps);
    expect(triggered).toContain('sig-ai');
    expect(triggered).not.toContain('sig-auth');
  });

  it('returns empty when no persisted needs exist', async () => {
    const execute = vi.fn(async () => dbResult());
    const deps = makeDependencies(execute);

    const triggered = await evaluateNewCatalogAdditions([100], deps);
    expect(triggered).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Read API tests
// ---------------------------------------------------------------------------

describe('readProjectIntelligence', () => {
  it('returns null draft and reviewed when no reports exist', async () => {
    const execute = vi.fn(async () => dbResult());
    const deps = makeDependencies(execute);

    const { draft, reviewed } = await loadLatestDraftReport(1, deps).then(async (d) => ({
      draft: d,
      reviewed: await loadLatestReviewedReport(1, deps),
    }));
    expect(draft).toBeNull();
    expect(reviewed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Project fingerprint persistence tests
// ---------------------------------------------------------------------------

describe('computeProjectFingerprint', () => {
  it('computes and persists a project fingerprint', async () => {
    const execute = vi.fn(async () => dbResult());
    const deps = makeDependencies(execute);

    const fp = await computeProjectFingerprint(project(), deps);
    expect(fp.repoId).toBe(1);
    expect(fp.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(fp.evidence.length).toBeGreaterThan(0);
    expect(execute).toHaveBeenCalled();
  });
});
