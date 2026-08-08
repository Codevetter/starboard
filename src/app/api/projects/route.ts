import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { PROJECT_SELECT, projectFromRow } from '@/lib/connected-projects';
import { trackProjectConnected, type ProjectConnectionSource } from '@/lib/analytics';
import {
  fetchPublicGitHubProject,
  GitHubProjectApiError,
  parseGitHubProjectInput,
} from '@/lib/github-projects';

export async function GET() {
  const session = await auth();

  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await db.execute({
    sql: `${PROJECT_SELECT}
          WHERE up.user_id = ?
          ORDER BY up.connected_at DESC, r.full_name ASC`,
    args: [session.user.githubId],
  });

  return NextResponse.json({ projects: result.rows.map(projectFromRow) });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    repository?: unknown;
    source?: unknown;
  } | null;
  const slug = parseGitHubProjectInput(typeof body?.repository === 'string' ? body.repository : '');
  if (!slug) {
    return NextResponse.json(
      { error: 'Enter a public GitHub URL or owner/repository.' },
      { status: 400 }
    );
  }

  let project;
  try {
    project = await fetchPublicGitHubProject(slug, session.accessToken);
  } catch (error) {
    if (error instanceof GitHubProjectApiError && [403, 429].includes(error.status)) {
      return NextResponse.json(
        { error: 'GitHub is temporarily limiting repository lookups. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    console.error('Failed to resolve connected project:', error);
    return NextResponse.json(
      { error: 'GitHub could not be reached. Try connecting the project again.' },
      { status: 502 }
    );
  }
  if (!project) {
    return NextResponse.json(
      { error: 'That repository is unavailable. Starboard currently supports public projects.' },
      { status: 404 }
    );
  }

  await db.batch([
    {
      sql: `INSERT INTO repos (
              id, name, full_name, owner_login, owner_avatar, html_url,
              description, language, stargazers_count, archived, topics,
              repo_created_at, repo_updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              full_name = excluded.full_name,
              owner_login = excluded.owner_login,
              owner_avatar = excluded.owner_avatar,
              html_url = excluded.html_url,
              description = excluded.description,
              language = excluded.language,
              stargazers_count = excluded.stargazers_count,
              archived = excluded.archived,
              topics = excluded.topics,
              repo_created_at = excluded.repo_created_at,
              repo_updated_at = excluded.repo_updated_at`,
      args: [
        project.id,
        project.name,
        project.fullName,
        project.ownerLogin,
        project.ownerAvatar,
        project.htmlUrl,
        project.description,
        project.language,
        project.stargazersCount,
        project.archived,
        JSON.stringify(project.topics),
        project.createdAt,
        project.updatedAt,
      ],
    },
    {
      sql: `INSERT INTO user_projects (user_id, repo_id)
            VALUES (?, ?)
            ON CONFLICT(user_id, repo_id) DO NOTHING`,
      args: [session.user.githubId, project.id],
    },
  ]);

  const connected = await db.execute({
    sql: `${PROJECT_SELECT}
          WHERE up.user_id = ? AND up.repo_id = ?`,
    args: [session.user.githubId, project.id],
  });

  const source: ProjectConnectionSource = body?.source === 'picker' ? 'picker' : 'manual';
  trackProjectConnected(source);

  return NextResponse.json({ project: projectFromRow(connected.rows[0]) }, { status: 201 });
}
