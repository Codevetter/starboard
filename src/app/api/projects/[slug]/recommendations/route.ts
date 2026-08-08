import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { PROJECT_SELECT, projectFromRow } from '@/lib/connected-projects';
import { retrieveProjectIntelligence } from '@/lib/project-intelligence';

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

  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get('limit') ?? 24) || 24, 1),
    50
  );
  const project = projectFromRow(projectResult.rows[0]);
  const recommendations = await retrieveProjectIntelligence(project, limit);

  return NextResponse.json({
    project,
    ...recommendations,
  });
}
