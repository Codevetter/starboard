import { type NextRequest, NextResponse } from 'next/server';

import { GitHubProjectApiError } from '@/lib/github-projects';
import { auth } from '@/lib/auth';
import { retrieveProjectIntelligence } from '@/lib/project-intelligence';
import { resolveProjectPreview } from '@/lib/project-preview';

export async function GET(request: NextRequest) {
  const repository = request.nextUrl.searchParams.get('repository') ?? '';
  try {
    let accessToken: string | undefined;
    try {
      accessToken = (await auth())?.accessToken;
    } catch {
      // Catalog previews are public and must remain available when optional
      // session hydration is unavailable.
    }
    const resolution = await resolveProjectPreview(repository, accessToken);
    if (resolution.status === 'invalid') {
      return NextResponse.json(
        { error: 'Enter a public GitHub URL or owner/repository.' },
        { status: 400 }
      );
    }
    if (resolution.status === 'unavailable') {
      return NextResponse.json(
        { error: 'That repository is unavailable. Starboard previews public projects only.' },
        { status: 404 }
      );
    }
    if (resolution.status === 'auth-required') {
      return NextResponse.json(
        {
          error: 'Sign in with GitHub to preview a repository outside the public catalog.',
          loginRequired: true,
        },
        { status: 401 }
      );
    }

    const recommendations = await retrieveProjectIntelligence(resolution.project, 12);
    return NextResponse.json(
      {
        project: resolution.project,
        source: resolution.source,
        ...recommendations,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600',
        },
      }
    );
  } catch (error) {
    if (error instanceof GitHubProjectApiError && [403, 429].includes(error.status)) {
      return NextResponse.json(
        { error: 'GitHub is temporarily limiting public lookups. Try this preview again shortly.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    console.error('Failed to preview public project:', error);
    return NextResponse.json(
      { error: 'Project preview is temporarily unavailable. Try again shortly.' },
      { status: 502 }
    );
  }
}
