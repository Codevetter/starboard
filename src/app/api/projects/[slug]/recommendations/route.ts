import type { InValue } from '@libsql/client';
import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { generateEmbedding } from '@/lib/embeddings';
import { getFleetProject } from '@/lib/fleet-project-data';
import {
  buildProjectRecommendationReport,
  type FleetRepoCandidate,
  type SemanticDistanceMap,
  semanticKey,
} from '@/lib/fleet-projects';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();

  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const project = getFleetProject(slug);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const limit = Math.min(
    Math.max(parseInt(request.nextUrl.searchParams.get('limit') || '30', 10) || 30, 20),
    30
  );
  const userId = session.user.githubId;
  const [repos, semanticDistances] = await Promise.all([
    fetchCandidateRepos(userId),
    fetchSemanticDistances(userId, project),
  ]);

  return NextResponse.json(
    buildProjectRecommendationReport(project, repos, {
      limit,
      semanticDistances,
    })
  );
}

async function fetchCandidateRepos(userId: string): Promise<FleetRepoCandidate[]> {
  const result = await db.execute({
    sql: `SELECT r.id,
                 r.name,
                 r.full_name,
                 r.html_url,
                 r.description,
                 r.language,
                 r.stargazers_count,
                 r.archived,
                 r.topics,
                 r.repo_updated_at,
                 ur.starred_at,
                 ur.is_saved,
                 aim.summary AS ai_summary,
                 aim.category AS ai_category,
                 aim.subcategories AS ai_subcategories,
                 aim.use_cases AS ai_use_cases,
                 aim.keywords AS ai_keywords
          FROM user_repos ur
          JOIN repos r ON r.id = ur.repo_id
          LEFT JOIN repo_ai_metadata aim ON aim.repo_id = r.id
          WHERE ur.user_id = ?
            AND (ur.is_starred = 1 OR ur.is_saved = 1)
          ORDER BY ur.is_saved DESC, r.stargazers_count DESC, r.repo_updated_at DESC
          LIMIT 2000`,
    args: [userId],
  });

  return result.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    fullName: row.full_name as string,
    htmlUrl: row.html_url as string,
    description: row.description as string | null,
    language: row.language as string | null,
    stargazersCount: row.stargazers_count as number,
    archived: Boolean(row.archived),
    topics: parseStringArray(row.topics as string),
    repoUpdatedAt: row.repo_updated_at as string | null,
    starredAt: row.starred_at as string | null,
    isSaved: Boolean(row.is_saved),
    ai: row.ai_summary
      ? {
          summary: row.ai_summary as string,
          category: row.ai_category as string | null,
          subcategories: parseStringArray(row.ai_subcategories as string),
          useCases: parseStringArray(row.ai_use_cases as string),
          keywords: parseStringArray(row.ai_keywords as string),
        }
      : null,
  }));
}

async function fetchSemanticDistances(
  userId: string,
  project: ReturnType<typeof getFleetProject>
): Promise<SemanticDistanceMap> {
  const distances: SemanticDistanceMap = new Map();
  if (!project) return distances;

  try {
    await Promise.all(
      project.featureAreas.slice(0, 7).map(async (featureArea) => {
        const query = [
          project.name,
          project.description,
          project.statusSummary,
          project.recommendationContext,
          `Feature: ${featureArea.label}`,
          featureArea.description,
          featureArea.keywords.join(', '),
        ].join('\n');
        const embedding = await generateEmbedding(query);
        const result = await db.execute({
          sql: `SELECT re.repo_id,
                       vector_distance_cos(re.embedding, vector(?)) AS dist
                FROM vector_top_k('idx_repo_embeddings_vec', vector(?), ?) AS vt
                JOIN repo_embeddings re ON re.rowid = vt.id
                JOIN user_repos ur ON ur.repo_id = re.repo_id
                WHERE ur.user_id = ?
                  AND (ur.is_starred = 1 OR ur.is_saved = 1)
                ORDER BY dist ASC`,
          args: [
            JSON.stringify(embedding),
            JSON.stringify(embedding),
            150,
            userId,
          ] satisfies InValue[],
        });

        for (const row of result.rows) {
          const distance = row.dist as number;
          if (distance > 0.72) continue;
          distances.set(semanticKey(row.repo_id as number, featureArea.id), distance);
        }
      })
    );
  } catch (error) {
    console.warn('Project recommendation semantic scoring failed:', error);
  }

  return distances;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
