import { NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { type ConnectedProject, PROJECT_SELECT, projectFromRow } from '@/lib/connected-projects';

/**
 * Authenticate the current user and load one of their connected projects by
 * slug (repo ID). Returns an error response when the user is unauthenticated
 * or the project does not belong to them.
 */
export async function loadOwnedProject(
  slug: string
): Promise<{ error: NextResponse } | { repoId: number; project: ConnectedProject }> {
  const session = await auth();
  if (!session?.user?.githubId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const repoId = Number(slug);
  if (!Number.isSafeInteger(repoId) || repoId <= 0) {
    return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  }

  const projectResult = await db.execute({
    sql: `${PROJECT_SELECT}
          WHERE up.user_id = ? AND up.repo_id = ?`,
    args: [session.user.githubId, repoId],
  });
  if (projectResult.rows.length === 0) {
    return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };
  }

  return { repoId, project: projectFromRow(projectResult.rows[0]) };
}
