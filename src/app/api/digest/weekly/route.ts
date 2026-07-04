import { NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { buildMaintainerDigest } from '@/lib/maintainer-digest';
import { loadMaintainerRepos } from '@/lib/weekly-alert-data';

export async function GET() {
  const session = await auth();

  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const repos = await loadMaintainerRepos(db, session.user.githubId);
  return NextResponse.json(buildMaintainerDigest(repos));
}
