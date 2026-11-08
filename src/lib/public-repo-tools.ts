import { cache } from 'react';
import { db } from '@/db';
import { getToolUrl, TOOL_ACCURACY_DISCLAIMER } from './repo-tools';

// Retained public source signals only. This path never enriches, generates
// summaries, loads user context or contacts GitHub/AI while serving a page.
export const getPublicRepoTools = cache(async (repoId: number) => {
  const result = await db.execute({
    sql: `SELECT tool_key, tool_name, category, confidence, sources, detected_at
          FROM repo_tools WHERE repo_id = ? AND category != 'language'
          ORDER BY confidence DESC, tool_name ASC LIMIT 12`,
    args: [repoId],
  });
  return {
    disclaimer: TOOL_ACCURACY_DISCLAIMER,
    tools: result.rows.map((row) => {
      let sources: unknown = [];
      try {
        sources = JSON.parse(String(row.sources || '[]'));
      } catch {
        /* No usable source paths. */
      }
      return {
        toolKey: String(row.tool_key),
        toolName: String(row.tool_name),
        category: String(row.category),
        confidence: Number(row.confidence),
        url: getToolUrl(String(row.tool_key)),
        sources: Array.isArray(sources)
          ? sources
              .filter(
                (source): source is string => typeof source === 'string' && source.length <= 300
              )
              .slice(0, 6)
          : [],
        detectedAt: typeof row.detected_at === 'string' ? row.detected_at : undefined,
      };
    }),
  };
});
