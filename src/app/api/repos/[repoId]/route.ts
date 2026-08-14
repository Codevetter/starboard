import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';

import { type GitHubRepoResponse, resolveRepoId, upsertRepoFromGitHub } from '../resolve';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const { repoId: rawId } = await params;
  const catalogOnly = request.nextUrl.searchParams.get('catalogOnly') === '1';

  // Support two modes:
  // 1. Numeric ID: /api/repos/12345
  // 2. Slug lookup: /api/repos/lookup?name=owner/repo
  let repoId: number;

  if (rawId === 'lookup') {
    const name = request.nextUrl.searchParams.get('name');
    if (!name?.includes('/')) {
      return NextResponse.json({ error: 'name param required (owner/repo)' }, { status: 400 });
    }
    const [owner, repo] = name.split('/', 2);
    const resolved = await resolveRepoId(owner, repo);
    if (!resolved) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
    }
    repoId = resolved;
  } else {
    repoId = parseInt(rawId, 10);
    if (Number.isNaN(repoId)) {
      return NextResponse.json({ error: 'Invalid repo ID' }, { status: 400 });
    }
  }

  try {
    // Look up repo in our DB
    let repoResult = await db.execute({
      sql: 'SELECT * FROM repos WHERE id = ?',
      args: [repoId],
    });

    // Catalog-only callers must never turn a read into a cache mutation.
    if (repoResult.rows.length === 0 && catalogOnly) {
      return NextResponse.json(
        { error: 'Repository not found in public catalog' },
        { status: 404 }
      );
    }

    // If not cached locally, fetch from GitHub and upsert
    if (repoResult.rows.length === 0) {
      const ghRes = await fetch(`https://api.github.com/repositories/${repoId}`, {
        next: { revalidate: 3600 },
      });

      if (!ghRes.ok) {
        if (ghRes.status === 404) {
          return NextResponse.json({ error: 'Repository not found' }, { status: 404 });
        }
        return NextResponse.json(
          { error: 'Failed to fetch repository from GitHub' },
          { status: 502 }
        );
      }

      const gh = (await ghRes.json()) as GitHubRepoResponse;

      await upsertRepoFromGitHub(gh);

      repoResult = await db.execute({
        sql: 'SELECT * FROM repos WHERE id = ?',
        args: [repoId],
      });
    }

    const row = repoResult.rows[0];

    return NextResponse.json({
      repo: {
        id: row.id as number,
        name: row.name as string,
        full_name: row.full_name as string,
        owner_login: row.owner_login as string,
        owner_avatar: row.owner_avatar as string,
        html_url: row.html_url as string,
        description: row.description as string | null,
        language: row.language as string | null,
        stargazers_count: row.stargazers_count as number,
        archived: Boolean(row.archived),
        topics: JSON.parse((row.topics as string) || '[]'),
        repo_created_at: row.repo_created_at as string | null,
        repo_updated_at: row.repo_updated_at as string | null,
      },
    });
  } catch (error) {
    console.error('Failed to fetch repo detail:', error);
    return NextResponse.json({ error: 'Failed to fetch repository' }, { status: 500 });
  }
}
