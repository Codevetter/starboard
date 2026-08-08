import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import {
  PROJECT_SELECT,
  parseProjectTools,
  parseStringArray,
  projectFromRow,
} from '@/lib/connected-projects';
import {
  type ProjectRecommendationRepo,
  rankProjectRecommendations,
} from '@/lib/project-recommendations';

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

  const candidateResult = await db.execute({
    sql: `SELECT r.id,
                 r.name,
                 r.full_name,
                 r.html_url,
                 r.description,
                 r.language,
                 r.stargazers_count,
                 r.archived,
                 r.topics,
                 aim.summary AS ai_summary,
                 aim.category AS ai_category,
                 aim.keywords AS ai_keywords,
                 COALESCE((
                   SELECT json_group_array(json_object(
                     'key', rt.tool_key,
                     'name', rt.tool_name,
                     'category', rt.category,
                     'confidence', rt.confidence
                   ))
                   FROM repo_tools rt
                   WHERE rt.repo_id = r.id
                 ), '[]') AS tools
          FROM repos r
          LEFT JOIN repo_ai_metadata aim ON aim.repo_id = r.id
          WHERE r.id != ?
            AND r.archived = 0
            AND r.stargazers_count >= 5000
          ORDER BY r.stargazers_count DESC
          LIMIT 500`,
    args: [repoId],
  });

  const candidates: ProjectRecommendationRepo[] = candidateResult.rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    fullName: String(row.full_name),
    htmlUrl: String(row.html_url),
    description: typeof row.description === 'string' ? row.description : null,
    language: typeof row.language === 'string' ? row.language : null,
    stargazersCount: Number(row.stargazers_count ?? 0),
    archived: Boolean(row.archived),
    topics: parseStringArray(row.topics),
    aiSummary: typeof row.ai_summary === 'string' ? row.ai_summary : null,
    aiCategory: typeof row.ai_category === 'string' ? row.ai_category : null,
    aiKeywords: parseStringArray(row.ai_keywords),
    tools: parseProjectTools(row.tools),
  }));

  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get('limit') ?? 24) || 24, 1),
    50
  );
  const project = projectFromRow(projectResult.rows[0]);

  return NextResponse.json({
    project,
    ...rankProjectRecommendations(project, candidates, limit),
  });
}
