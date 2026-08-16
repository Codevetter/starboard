import { NextResponse } from 'next/server';

import { db } from '@/db';
import { PROJECT_SELECT, projectFromRow } from '@/lib/connected-projects';
import { createNeedDrivenIntelligence } from '@/lib/need-driven-intelligence';
import { hasValidOperatorToken } from '@/lib/operator-auth';
import { repoVectors } from '@/lib/repo-vectors';
import { generateEmbeddings } from '@/lib/embeddings';

async function isAuthorized(request: Request): Promise<boolean> {
  return hasValidOperatorToken(
    request.headers.get('authorization'),
    process.env.AI_GATEWAY_API_KEY
  );
}

/**
 * POST /api/internal/project-intelligence/run
 *
 * Runs the deterministic need-driven intelligence pipeline for a specific
 * project. Operator-only — Fleet automation uses this to trigger pipeline
 * runs for priority projects. Never invokes external reviewers.
 *
 * Body: { repoId: number, catalogGeneration?: string }
 */
export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { repoId?: unknown; catalogGeneration?: unknown };
  try {
    body = (await request.json()) as { repoId?: unknown; catalogGeneration?: unknown };
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const repoId = Number(body.repoId);
  if (!Number.isSafeInteger(repoId) || repoId <= 0) {
    return NextResponse.json({ error: 'repoId must be a positive integer' }, { status: 400 });
  }

  const projectResult = await db.execute({
    sql: `${PROJECT_SELECT} WHERE up.repo_id = ? LIMIT 1`,
    args: [repoId],
  });
  if (projectResult.rows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const project = projectFromRow(projectResult.rows[0]);
  const catalogGeneration =
    typeof body.catalogGeneration === 'string'
      ? body.catalogGeneration
      : new Date().toISOString().slice(0, 10);

  const run = createNeedDrivenIntelligence({
    database: db,
    vectorStore: repoVectors,
    embed: generateEmbeddings,
  });

  try {
    const report = await run(project, { catalogGeneration });
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pipeline failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
