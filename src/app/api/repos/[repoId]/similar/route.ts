import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { chunkForD1 } from '@/lib/d1-limits';
import { repoVectors } from '@/lib/repo-vectors';

const VEC_TOP_K = 100;
const DIST_MAX = 0.62;
const DEFAULT_LIMIT = 10;

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

const WORD_SEPARATOR_RE = /[^a-z0-9+#]+/i;

function wordSet(value: string | null | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .toLowerCase()
      .split(WORD_SEPARATOR_RE)
      .filter((word) => word.length >= 3)
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ repoId: string }> }
) {
  let userId: string | null = null;
  try {
    userId = (await auth())?.user?.githubId ?? null;
  } catch {
    // Global similarity is public. Only the explicit user scope fails closed.
  }

  const { repoId: rawId } = await params;
  const repoId = parseInt(rawId, 10);
  if (Number.isNaN(repoId)) {
    return NextResponse.json({ error: 'Invalid repo ID' }, { status: 400 });
  }

  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '', 10) || DEFAULT_LIMIT, 1), 30);
  const scope = request.nextUrl.searchParams.get('scope') || 'global'; // "user" | "global"
  if (scope === 'user' && !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Confirm the relational vector metadata exists and load lightweight
    //    repository metadata for deterministic reranking.
    const seed = await db.execute({
      sql: `SELECT r.name,
                   r.full_name,
                   r.description,
                   r.language,
                   r.topics
            FROM repo_embeddings re
            JOIN repos r ON r.id = re.repo_id
            WHERE re.repo_id = ?`,
      args: [repoId],
    });
    if (seed.rows.length === 0) {
      return NextResponse.json({ similar: [], reason: 'no_embedding' });
    }

    // 2. ANN search through the project-owned Cloudflare Vectorize index.
    const candidates = (await repoVectors().queryByRepoId(repoId, VEC_TOP_K))
      .filter((match) => match.repoId !== repoId && match.distance <= DIST_MAX)
      .map((match) => ({
        repo_id: match.repoId,
        dist: match.distance,
      }));

    if (candidates.length === 0) {
      return NextResponse.json({ similar: [] });
    }

    // 3. Hydrate. Optionally restrict to user's own stars.
    const ids = candidates.map((c) => c.repo_id);
    const hydratedResults = await Promise.all(
      chunkForD1(ids, scope === 'global' ? 0 : 1).map((chunk) => {
        const placeholders = chunk.map(() => '?').join(', ');
        const sql =
          scope === 'global'
            ? `SELECT r.id, r.name, r.full_name, r.owner_login, r.owner_avatar,
                     r.html_url, r.description, r.language, r.stargazers_count,
                     r.archived, r.topics, r.repo_updated_at
               FROM repos r
               WHERE r.id IN (${placeholders})`
            : `SELECT r.id, r.name, r.full_name, r.owner_login, r.owner_avatar,
                     r.html_url, r.description, r.language, r.stargazers_count,
                     r.archived, r.topics, r.repo_updated_at,
                     ur.list_id,
                     COALESCE((
                       SELECT json_group_array(url.list_id)
                       FROM user_repo_lists url
                       WHERE url.user_id = ur.user_id AND url.repo_id = ur.repo_id
                     ), '[]') AS collection_ids
               FROM user_repos ur
               JOIN repos r ON r.id = ur.repo_id
               WHERE ur.user_id = ? AND r.id IN (${placeholders})`;
        return db.execute({ sql, args: scope === 'global' ? chunk : [userId!, ...chunk] });
      })
    );
    const hydratedRows = hydratedResults.flatMap((result) => result.rows);

    // 4. Re-attach distance and rerank. Vector distance stays primary; shared
    // topics, language, and repo-description terms stabilize close semantic matches.
    const seedRow = seed.rows[0];
    const seedTopics = new Set(parseTopics(seedRow.topics));
    const seedWords = wordSet(
      `${seedRow.full_name as string} ${seedRow.description as string | null}`
    );
    const seedLanguage = (seedRow.language as string | null) ?? null;
    const distMap = new Map(candidates.map((c) => [c.repo_id, c.dist]));
    const repoMap = new Map(hydratedRows.map((r) => [r.id as number, r]));
    const ordered = ids
      .map((id) => repoMap.get(id))
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map((row) => {
        const dist = distMap.get(row.id as number) ?? 1;
        const similarity = 1 - dist;
        const topics = parseTopics(row.topics);
        const sharedTopics = topics.filter((topic) => seedTopics.has(topic)).length;
        const candidateWords = wordSet(
          `${row.full_name as string} ${row.description as string | null}`
        );
        let sharedWords = 0;
        for (const word of candidateWords) {
          if (seedWords.has(word)) sharedWords++;
        }
        const languageBoost =
          seedLanguage && seedLanguage === (row.language as string | null) ? 0.03 : 0;
        const topicBoost = Math.min(sharedTopics * 0.035, 0.14);
        const wordBoost = Math.min(sharedWords * 0.008, 0.04);
        return {
          row,
          similarity,
          score: similarity + languageBoost + topicBoost + wordBoost,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ row, similarity }) => ({
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
        updated_at: row.repo_updated_at as string | null,
        list_id: (row.list_id as number | null | undefined) ?? null,
        collection_ids: row.collection_ids
          ? JSON.parse((row.collection_ids as string) || '[]')
          : [],
        tags: [],
        similarity,
      }));

    return NextResponse.json({ similar: ordered });
  } catch (error) {
    console.error('Failed to fetch similar repos:', error);
    return NextResponse.json({ error: 'Failed to fetch similar repos' }, { status: 500 });
  }
}
