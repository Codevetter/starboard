/**
 * Shared base mapping for repository rows across API routes. Each route spreads
 * this result and adds its own route-specific fields.
 */
export function mapRepoBaseRow(row: Record<string, unknown>) {
  return {
    id: row.id as number,
    name: row.name as string,
    full_name: row.full_name as string,
    owner: {
      login: row.owner_login as string,
      avatar_url: row.owner_avatar as string,
    },
    html_url: row.html_url as string,
    description: row.description as string | null,
    language: row.language as string | null,
    stargazers_count: row.stargazers_count as number,
    archived: Boolean(row.archived),
    topics: parseTopics(row.topics),
  };
}

function parseTopics(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((topic): topic is string => typeof topic === 'string')
      : [];
  } catch {
    return [];
  }
}
