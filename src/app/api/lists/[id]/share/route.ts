import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { auth } from '@/lib/auth';
import { generateUniqueListSlug } from '@/lib/list-sharing';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.githubId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const listId = parseInt(id, 10);
  if (Number.isNaN(listId)) {
    return NextResponse.json({ error: 'Invalid list id' }, { status: 400 });
  }

  // Fetch current list state and verify ownership
  const current = await db.execute({
    sql: 'SELECT id, name, is_public, slug FROM user_lists WHERE id = ? AND user_id = ?',
    args: [listId, session.user.githubId],
  });

  if (current.rows.length === 0) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 });
  }

  const list = current.rows[0];
  const isCurrentlyPublic = list.is_public === 1;

  if (isCurrentlyPublic) {
    // Make private — keep slug so re-sharing uses the same URL
    await db.execute({
      sql: 'UPDATE user_lists SET is_public = 0 WHERE id = ? AND user_id = ?',
      args: [listId, session.user.githubId],
    });

    return NextResponse.json({
      is_public: false,
      slug: list.slug as string,
    });
  } else {
    // Make public — generate a readable slug once and keep it stable.
    const slug = list.slug
      ? (list.slug as string)
      : await generateUniqueListSlug(list.name as string, async (candidate) => {
          const existing = await db.execute({
            sql: 'SELECT 1 FROM user_lists WHERE slug = ? LIMIT 1',
            args: [candidate],
          });
          return existing.rows.length > 0;
        });

    await db.execute({
      sql: 'UPDATE user_lists SET is_public = 1, slug = ? WHERE id = ? AND user_id = ?',
      args: [slug, listId, session.user.githubId],
    });

    return NextResponse.json({
      is_public: true,
      slug,
    });
  }
}
