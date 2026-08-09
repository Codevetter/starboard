import { db } from '@/db';
import type { DbClient } from '@/db/client';
import { projectRecommendationFromRow } from '@/lib/connected-projects';
import {
  fetchPublicGitHubProject,
  parseGitHubProjectInput,
  type PublicGitHubProject,
} from '@/lib/github-projects';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';

export type ProjectPreviewResolution =
  | { status: 'invalid' }
  | { status: 'unavailable' }
  | { status: 'auth-required' }
  | { status: 'resolved'; source: 'catalog' | 'github'; project: ProjectRecommendationRepo };

export interface ProjectPreviewDependencies {
  database: Pick<DbClient, 'execute'>;
  fetchProject: typeof fetchPublicGitHubProject;
}

const defaultDependencies: ProjectPreviewDependencies = {
  database: db,
  fetchProject: fetchPublicGitHubProject,
};

function externalProject(project: PublicGitHubProject): ProjectRecommendationRepo {
  return {
    id: project.id,
    name: project.name,
    fullName: project.fullName,
    htmlUrl: project.htmlUrl,
    description: project.description,
    language: project.language,
    stargazersCount: project.stargazersCount,
    archived: project.archived,
    topics: project.topics,
    aiSummary: null,
    aiCategory: null,
    aiKeywords: [],
    tools: [],
  };
}

export function createProjectPreviewResolver(
  dependencies: ProjectPreviewDependencies = defaultDependencies
) {
  return async function resolveProjectPreview(
    input: string,
    accessToken?: string
  ): Promise<ProjectPreviewResolution> {
    const slug = parseGitHubProjectInput(input);
    if (!slug) return { status: 'invalid' };

    const catalog = await dependencies.database.execute({
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
            WHERE r.full_name = ? COLLATE NOCASE
            LIMIT 1`,
      args: [slug.fullName],
    });
    if (catalog.rows.length > 0) {
      return {
        status: 'resolved',
        source: 'catalog',
        project: projectRecommendationFromRow(catalog.rows[0]),
      };
    }

    if (!accessToken) return { status: 'auth-required' };

    const project = await dependencies.fetchProject(slug, accessToken);
    return project
      ? { status: 'resolved', source: 'github', project: externalProject(project) }
      : { status: 'unavailable' };
  };
}

export const resolveProjectPreview = createProjectPreviewResolver();
