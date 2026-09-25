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
    // OAuth apps list org repositories only for orgs that have granted the
    // app. GitHub never re-shows the consent screen after first sign-in, so
    // the picker links to the app's connection page where additional orgs
    // can be granted or requested.
    const clientId = process.env.AUTH_GITHUB_ID ?? process.env.GITHUB_ID ?? '';
    return NextResponse.json({
      repositories,
      orgAccessUrl: clientId
        ? `https://github.com/settings/connections/applications/${clientId}`
        : null,
    });
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
