import type { InValue } from '@/db/client';
import { type NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import {
  buildStackBuilderReport,
  normalizeTopics,
  parseStackGoal,
  type StackRepoInput,
} from '@/lib/stack-builder';

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const params = request.nextUrl.searchParams;
    const goal = parseStackGoal(params.get('goal'));
    const q = params.get('q')?.trim() || null;
    const language = params.get('language')?.trim() || null;
    const listId = params.get('list_id')?.trim() || null;
    const whereClauses = ['ur.user_id = ?', 'ur.is_starred = 1'];
    const whereArgs: InValue[] = [session.user.githubId];

    if (q) {
      const like = `%${q}%`;
      whereClauses.push(`(
      r.name LIKE ? COLLATE NOCASE OR
      r.full_name LIKE ? COLLATE NOCASE OR
      r.description LIKE ? COLLATE NOCASE OR
      r.topics LIKE ? COLLATE NOCASE
    )`);
      whereArgs.push(like, like, like, like);
    }

    if (language) {
      whereClauses.push('r.language = ?');
      whereArgs.push(language);
    }

    if (listId) {
      const parsedListId = parseInt(listId, 10);
      if (!Number.isInteger(parsedListId)) {
        return NextResponse.json({ error: 'Invalid list_id' }, { status: 400 });
      }
      whereClauses.push(
        'EXISTS (SELECT 1 FROM user_repo_lists url WHERE url.user_id = ur.user_id AND url.repo_id = ur.repo_id AND url.list_id = ?)'
      );
      whereArgs.push(parsedListId);
    }

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
                 ur.starred_at
          FROM user_repos ur
          JOIN repos r ON r.id = ur.repo_id
          WHERE ${whereClauses.join(' AND ')}
          ORDER BY ur.starred_at DESC, r.stargazers_count DESC
          LIMIT 1000`,
      args: whereArgs,
    });

    const repos: StackRepoInput[] = result.rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name ?? ''),
      fullName: String(row.full_name ?? ''),
      htmlUrl: String(row.html_url ?? ''),
      description: (row.description as string | null) ?? null,
      language: (row.language as string | null) ?? null,
      stargazersCount: Number(row.stargazers_count ?? 0) || 0,
      archived: Boolean(row.archived),
      // D1 may return JSON as a string, array, or null — never throw on parse.
      topics: normalizeTopics(row.topics),
      repoUpdatedAt: (row.repo_updated_at as string | null) ?? null,
      starredAt: (row.starred_at as string | null) ?? null,
    }));

    return NextResponse.json(buildStackBuilderReport(repos, { goal }));
  } catch (error) {
    console.error('Stack builder failed:', error);
    return NextResponse.json({ error: 'Stack builder failed' }, { status: 500 });
  }
}
