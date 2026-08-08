import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { fetchPublicGitHubRepositories, GitHubProjectApiError } from '@/lib/github-projects';

export async function GET() {
  const session = await auth();
  if (!session?.accessToken || !session.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const repositories = await fetchPublicGitHubRepositories(session.accessToken);
    return NextResponse.json({ repositories });
  } catch (error) {
    if (error instanceof GitHubProjectApiError && [403, 429].includes(error.status)) {
      return NextResponse.json(
        { error: 'GitHub is temporarily limiting repository choices. Paste a public URL instead.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    console.error('Failed to load public GitHub repositories:', error);
    return NextResponse.json(
      { error: 'GitHub repositories could not load. Paste a public URL instead.' },
      { status: 502 }
    );
  }
}
