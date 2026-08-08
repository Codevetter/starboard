import type { ProjectRecommendationRepo, ProjectToolSignal } from '@/lib/project-recommendations';

export interface ConnectedProject extends ProjectRecommendationRepo {
  ownerLogin: string;
  ownerAvatar: string;
  connectedAt: string;
}

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function parseProjectTools(value: unknown): ProjectToolSignal[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (tool) =>
          typeof tool.key === 'string' &&
          typeof tool.name === 'string' &&
          typeof tool.category === 'string'
      )
      .map((tool) => ({
        key: tool.key as string,
        name: tool.name as string,
        category: tool.category as string,
        confidence: Number(tool.confidence ?? 0),
      }));
  } catch {
    return [];
  }
}

export function projectFromRow(row: Record<string, unknown>): ConnectedProject {
  return {
    ...projectRecommendationFromRow(row),
    ownerLogin: String(row.owner_login),
    ownerAvatar: String(row.owner_avatar),
    connectedAt: String(row.connected_at ?? ''),
  };
}

export function projectRecommendationFromRow(
  row: Record<string, unknown>
): ProjectRecommendationRepo {
  return {
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
  };
}

export const PROJECT_SELECT = `SELECT r.id,
       r.name,
       r.full_name,
       r.owner_login,
       r.owner_avatar,
       r.html_url,
       r.description,
       r.language,
       r.stargazers_count,
       r.archived,
       r.topics,
       up.connected_at,
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
FROM user_projects up
JOIN repos r ON r.id = up.repo_id
LEFT JOIN repo_ai_metadata aim ON aim.repo_id = r.id`;
