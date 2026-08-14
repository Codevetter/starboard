import type { InStatement } from './client';
import { createD1RestClientFromEnv } from './rest-client';
import { buildEmbeddingFromRow, generateEmbeddings } from '../lib/embeddings';
import { createVectorizeRestWriterFromEnv } from '../lib/repo-vectors-rest';

const BATCH_SIZE = 50;
const EMBED_LIMIT = parseInt(process.env.EMBED_LIMIT || '0', 10);
const MIN_STARS_FLOOR = parseInt(process.env.MIN_STARS_FLOOR || '5000', 10);

async function seed() {
  const db = createD1RestClientFromEnv();
  const vectors = createVectorizeRestWriterFromEnv();

  const existing = await db.execute('SELECT repo_id, text_hash FROM repo_embeddings');
  const existingHashes = new Map(
    existing.rows.map((r) => [r.repo_id as number, r.text_hash as string])
  );

  const repos = await db.execute({
    sql: `SELECT r.id,
                 r.full_name,
                 r.description,
                 r.language,
                 r.topics,
                 ram.summary,
                 ram.category,
                 ram.subcategories,
                 ram.use_cases,
                 ram.keywords
          FROM repos r
          LEFT JOIN repo_ai_metadata ram ON ram.repo_id = r.id
          WHERE r.id IN (
            SELECT r2.id
            FROM repos r2
            WHERE r2.stargazers_count >= ?
            UNION
            SELECT ur.repo_id
            FROM user_repos ur
            WHERE ur.is_starred = 1
          )
          ORDER BY r.stargazers_count DESC`,
    args: [MIN_STARS_FLOOR],
  });

  const toEmbed: { id: number; text: string; hash: string }[] = [];
  for (const row of repos.rows) {
    const { text, hash } = buildEmbeddingFromRow(row);
    if (existingHashes.get(row.id as number) !== hash) {
      toEmbed.push({ id: row.id as number, text, hash });
    }
    if (EMBED_LIMIT > 0 && toEmbed.length >= EMBED_LIMIT) {
      break;
    }
  }

  console.info(`${repos.rows.length} eligible repos, ${toEmbed.length} need embedding`);

  if (toEmbed.length === 0) {
    console.info('Nothing to do');
    process.exit(0);
  }

  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r) => r.text);

    console.info(
      `Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toEmbed.length / BATCH_SIZE)} (${batch.length} repos)...`
    );

    const embeddings = await generateEmbeddings(texts);
    await vectors.upsert(batch.map((item, j) => ({ repoId: item.id, values: embeddings[j] })));

    const stmts: InStatement[] = batch.map((item) => ({
      sql: `INSERT INTO repo_embeddings (repo_id, text_hash)
            VALUES (?, ?)
            ON CONFLICT(repo_id) DO UPDATE SET
              text_hash = excluded.text_hash`,
      args: [item.id, item.hash],
    }));

    await db.batch(stmts);
  }

  const count = await db.execute('SELECT COUNT(*) as c FROM repo_embeddings');
  console.info(`Done. ${count.rows[0]?.c} repos now have embeddings.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
