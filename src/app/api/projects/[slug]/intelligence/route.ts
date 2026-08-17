import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { PROJECT_SELECT, projectFromRow } from '@/lib/connected-projects';
import {
  createNeedDrivenIntelligence,
  loadLatestDraftReport,
  loadLatestReviewedReport,
} from '@/lib/need-driven-intelligence';
import { repoVectors } from '@/lib/repo-vectors';
import { generateEmbeddings } from '@/lib/embeddings';

/**
 * GET /api/projects/[slug]/intelligence
 *
 * Reads the persisted need-driven project intelligence report. This endpoint
 * never triggers external-agent spend — it only reads persisted draft and
 * reviewed reports. If no report exists and `?run=1` is passed, it runs the
 * deterministic pipeline once.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const repoId = Number(slug);
  if (!Number.isSafeInteger(repoId) || repoId <= 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const projectResult = await db.execute({
    sql: `${PROJECT_SELECT}
          WHERE up.user_id = ? AND up.repo_id = ?`,
    args: [session.user.githubId, repoId],
  });
  if (projectResult.rows.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const dependencies = {
    database: db,
    vectorStore: repoVectors,
    embed: generateEmbeddings,
  };

  const [draft, reviewed] = await Promise.all([
    loadLatestDraftReport(repoId, dependencies),
    loadLatestReviewedReport(repoId, dependencies),
  ]);

  // If no report exists and the user requests a run, generate one
  const shouldRun = request.nextUrl.searchParams.get('run') === '1';
  if (!draft && shouldRun) {
    const project = projectFromRow(projectResult.rows[0]);
    const run = createNeedDrivenIntelligence(dependencies);
    const newDraft = await run(project);
    return NextResponse.json({ draft: newDraft, reviewed: null });
  }

  return NextResponse.json({ draft, reviewed });
}
