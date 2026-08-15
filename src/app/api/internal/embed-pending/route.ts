import type { InStatement } from '@/db/client';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { buildEmbeddingFromRow, generateEmbeddings } from '@/lib/embeddings';
import { hasValidOperatorToken } from '@/lib/operator-auth';
import { repoVectors } from '@/lib/repo-vectors';

const BATCH_SIZE = 50;
const DEFAULT_LIMIT = 3000;
const MAX_LIMIT = 3000;
const MIN_STARS_FLOOR = 5000;

async function isAuthorized(request: Request): Promise<boolean> {
  return hasValidOperatorToken(
    request.headers.get('authorization'),
    process.env.AI_GATEWAY_API_KEY
  );
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await db.execute('SELECT repo_id FROM repo_embeddings ORDER BY repo_id LIMIT 1');
  const repoId = Number(result.rows[0]?.repo_id);
  if (!Number.isSafeInteger(repoId)) {
    return NextResponse.json({ error: 'No embedding probe row is available' }, { status: 503 });
  }

  await repoVectors().queryByRepoId(repoId, 1);
  return NextResponse.json({ ok: true, bindings: { d1: 'ok', vectorize: 'ok' } });
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { limit?: unknown };
  try {
    body = (await request.json()) as { limit?: unknown };
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const requestedLimit = body.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(requestedLimit) || Number(requestedLimit) < 1) {
    return NextResponse.json({ error: 'limit must be a positive integer' }, { status: 400 });
  }
  const limit = Math.min(Number(requestedLimit), MAX_LIMIT);

  const repos = await db.execute({
    sql: `SELECT r.id,
                 r.full_name,
                 r.description,
                 r.language,
                 r.topics,
                 re.text_hash,
                 ram.summary,
                 ram.category,
                 ram.subcategories,
                 ram.use_cases,
                 ram.keywords
          FROM repos r
          LEFT JOIN repo_embeddings re ON re.repo_id = r.id
          LEFT JOIN repo_ai_metadata ram ON ram.repo_id = r.id
          WHERE r.id IN (
            SELECT r2.id FROM repos r2 WHERE r2.stargazers_count >= ?
            UNION
            SELECT repo_id FROM user_repos WHERE is_starred = 1
          )
          ORDER BY r.stargazers_count DESC`,
    args: [MIN_STARS_FLOOR],
  });

  const pending: { id: number; text: string; hash: string }[] = [];
  for (const row of repos.rows) {
    const { text, hash } = buildEmbeddingFromRow(row);
    if (row.text_hash !== hash) {
      pending.push({ id: row.id as number, text, hash });
    }
  }

  const selected = pending.slice(0, limit);
  for (let i = 0; i < selected.length; i += BATCH_SIZE) {
    const batch = selected.slice(i, i + BATCH_SIZE);
    const embeddings = await generateEmbeddings(batch.map((item) => item.text));
    await repoVectors().upsert(
      batch.map((item, index) => ({ repoId: item.id, values: embeddings[index] }))
    );
    const statements: InStatement[] = batch.map((item) => ({
      sql: `INSERT INTO repo_embeddings (repo_id, text_hash)
            VALUES (?, ?)
            ON CONFLICT(repo_id) DO UPDATE SET text_hash = excluded.text_hash`,
      args: [item.id, item.hash],
    }));
    await db.batch(statements);
  }

  return NextResponse.json({
    eligible: repos.rows.length,
    embedded: selected.length,
    remaining: pending.length - selected.length,
    limit,
  });
}
