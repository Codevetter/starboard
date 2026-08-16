import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  ingestExternalReview,
  type ExternalReviewResult,
  type ReviewVerdict,
} from '@/lib/need-driven-intelligence';
import { hasValidOperatorToken } from '@/lib/operator-auth';

async function isAuthorized(request: Request): Promise<boolean> {
  return hasValidOperatorToken(
    request.headers.get('authorization'),
    process.env.AI_GATEWAY_API_KEY
  );
}

function isReviewVerdict(value: unknown): value is ReviewVerdict {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.needId === 'string' &&
    (v.verdict === 'supported' || v.verdict === 'unsupported' || v.verdict === 'refined') &&
    typeof v.rationale === 'string'
  );
}

function validateReviewResult(body: unknown): ExternalReviewResult | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Request body must be a JSON object' };
  }
  const obj = body as Record<string, unknown>;
  if (typeof obj.idempotencyKey !== 'string' || !obj.idempotencyKey) {
    return { error: 'idempotencyKey must be a non-empty string' };
  }
  if (typeof obj.reviewerProvider !== 'string' || !obj.reviewerProvider) {
    return { error: 'reviewerProvider must be a non-empty string' };
  }
  if (typeof obj.reviewerModel !== 'string' || !obj.reviewerModel) {
    return { error: 'reviewerModel must be a non-empty string' };
  }
  if (
    typeof obj.reviewerUsage !== 'object' ||
    obj.reviewerUsage === null ||
    Array.isArray(obj.reviewerUsage)
  ) {
    return { error: 'reviewerUsage must be an object' };
  }
  if (!Array.isArray(obj.verdicts)) {
    return { error: 'verdicts must be an array' };
  }
  for (const verdict of obj.verdicts) {
    if (!isReviewVerdict(verdict)) {
      return {
        error:
          'Each verdict must have needId, verdict (supported|unsupported|refined), and rationale',
      };
    }
  }
  return {
    idempotencyKey: obj.idempotencyKey,
    reviewerProvider: obj.reviewerProvider,
    reviewerModel: obj.reviewerModel,
    reviewerUsage: obj.reviewerUsage as Record<string, number>,
    verdicts: obj.verdicts as ReviewVerdict[],
  };
}

/**
 * POST /api/internal/external-reviews/ingest
 *
 * Provider-neutral external review ingestion. Fleet automation (or any
 * orchestrator) submits a structured review result after running a bounded
 * Devin session. Starboard never stores Devin credentials and never requires
 * Devin to serve deterministic recommendations.
 *
 * Idempotent: duplicate submissions with the same idempotency key return the
 * existing reviewed report without creating a new one.
 */
export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const validated = validateReviewResult(body);
  if ('error' in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const result = await ingestExternalReview(validated, {
      database: db,
      vectorStore: () => ({ query: async () => [], queryByRepoId: async () => [] }),
      embed: async () => [[]],
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ingestion failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
