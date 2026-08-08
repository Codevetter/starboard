import { NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const repoId = Number(slug);
  if (!Number.isSafeInteger(repoId) || repoId <= 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const result = await db.execute({
    sql: 'DELETE FROM user_projects WHERE user_id = ? AND repo_id = ?',
    args: [session.user.githubId, repoId],
  });

  if (result.rowsAffected === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
