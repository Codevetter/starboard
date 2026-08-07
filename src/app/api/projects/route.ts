import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { listFleetProjectSummaries } from '@/lib/fleet-project-data';

export async function GET() {
  const session = await auth();

  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    projects: listFleetProjectSummaries(),
  });
}
