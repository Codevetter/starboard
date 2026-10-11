import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createD1RestClientFromEnv } from '../src/db/rest-client';
import {
  assertKnowledgeMigrationReady,
  catalogMembershipHash,
  KNOWLEDGE_DERIVED_TABLES,
} from './knowledge-migration-readiness';
import {
  refreshKnowledgeRepository,
  findKnowledgeDocument,
  ingestKnowledgeDocuments,
} from '../src/lib/knowledge-catalog';
import { enrichKnowledgeRepository } from '../src/lib/knowledge-enrichment';
import {
  ingestStarboardRagDocuments,
  knowledgebaseJson,
  personalIndexPath,
} from '../src/lib/knowledgebase';

const MODE = process.argv[2] || 'plan';
const AFTER = Number(process.env.KNOWLEDGE_MIGRATION_AFTER || '0');
const LIMIT = Math.min(250, Math.max(1, Number(process.env.KNOWLEDGE_MIGRATION_LIMIT || '50')));
const OUTPUT = resolve(`.fleet-local/knowledge-migration/manifest-${MODE}.json`);
const DERIVED_TABLES = KNOWLEDGE_DERIVED_TABLES;
interface Entry {
  repoId: number;
  fullName: string;
  status: string;
  sourceStatus?: string;
  revision?: string | null;
  documentId?: string;
  contentHash?: string;
  error?: string;
}
interface Manifest {
  schemaVersion: number;
  mode: string;
  lastProcessedId: number;
  entries: Entry[];
  derived: Record<string, number>;
  derivedExpected: Record<string, number>;
  catalogSize?: number;
  catalogIdsHash?: string;
  updatedAt: string;
}

async function loadManifest(): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(OUTPUT, 'utf8')) as Manifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {
      schemaVersion: 1,
      mode: MODE,
      lastProcessedId: AFTER,
      entries: [],
      derived: {},
      derivedExpected: {},
      updatedAt: new Date().toISOString(),
    };
  }
}
async function save(manifest: Manifest) {
  await mkdir(resolve('.fleet-local/knowledge-migration'), { recursive: true });
  manifest.updatedAt = new Date().toISOString();
  await writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
async function migrateRepo(row: Record<string, unknown>): Promise<Entry> {
  const repoId = Number(row.id);
  const base = { repoId, fullName: String(row.full_name) };
  if (MODE === 'plan') return { ...base, status: 'planned' };
  if (MODE === 'reconcile') {
    const stored = await findKnowledgeDocument(`repo:${repoId}`);
    const profile = await findKnowledgeDocument(`repo:${repoId}:profile`);
    if (!stored) return { ...base, status: 'missing' };
    const qualified =
      ['complete', 'partial'].includes(String(stored.document.metadata.source_status)) &&
      Boolean(stored.document.metadata.source_revision);
    const currentProfile = profile?.document.metadata.source_document_id === stored.document.id;
    return {
      ...base,
      status: qualified && currentProfile ? 'reconciled' : 'incomplete',
      sourceStatus: String(stored.document.metadata.source_status || 'unavailable'),
      documentId: stored.document.id,
      contentHash: createHash('sha256').update(stored.document.content).digest('hex'),
      revision: String(stored.document.metadata.source_revision || ''),
    };
  }
  const refresh = await refreshKnowledgeRepository(row, undefined, true);
  if (refresh.sourceStatus === 'unavailable' || refresh.retainedPrevious)
    return {
      ...base,
      status: 'incomplete',
      sourceStatus: refresh.sourceStatus,
      revision: refresh.revision,
    };
  await enrichKnowledgeRepository(
    {
      id: repoId,
      full_name: String(row.full_name),
      description: row.description as string | null,
      language: row.language as string | null,
      topics: String(row.topics || '[]'),
    },
    false
  );
  const stored = await findKnowledgeDocument(`repo:${repoId}`);
  if (!stored) throw new Error('Published source missing after ingestion');
  return {
    ...base,
    status: 'migrated',
    sourceStatus: refresh.sourceStatus,
    revision: refresh.revision,
    documentId: stored.document.id,
    contentHash: createHash('sha256').update(stored.document.content).digest('hex'),
  };
}

async function migrateDerived(
  database: ReturnType<typeof createD1RestClientFromEnv>,
  manifest: Manifest
) {
  for (const table of DERIVED_TABLES) {
    // Identifiers come exclusively from the fixed table allowlist.
    const count = await database.execute({
      sql: `SELECT COUNT(*) AS count FROM ${table}`,
      args: [],
    });
    const total = Number(count.rows[0]?.count || 0);
    manifest.derivedExpected[table] = total;
    if (MODE === 'plan') {
      manifest.derived[table] = total;
      continue;
    }
    let complete = 0;
    for (let offset = 0; offset < total; offset += 25) {
      const result = await database.execute({
        sql: `SELECT rowid AS migration_rowid, * FROM ${table} ORDER BY rowid LIMIT 25 OFFSET ?`,
        args: [offset],
      });
      const documents = result.rows.map((row) => ({
        external_id: `legacy:${table}:${row.migration_rowid}`,
        content: JSON.stringify(row),
        metadata: {
          kind: 'legacy_knowledge',
          source_table: table,
          source_row_id: row.migration_rowid,
          repo_id: row.repo_id,
          validation: 'legacy_unvalidated',
          visibility: 'public',
        },
      }));
      if (MODE === 'apply') {
        await ingestKnowledgeDocuments(documents);
        complete += documents.length;
      } else
        for (const document of documents) {
          const stored = await findKnowledgeDocument(document.external_id);
          if (stored?.document.content === document.content) complete++;
        }
    }
    manifest.derived[table] = complete;
    await save(manifest);
  }
}

async function migrateLibrary(
  database: ReturnType<typeof createD1RestClientFromEnv>,
  manifest: Manifest
) {
  const count = await database.execute({
    sql: 'SELECT COUNT(*) AS count FROM user_repos WHERE is_starred = 1 OR is_saved = 1',
    args: [],
  });
  const total = Number(count.rows[0]?.count || 0);
  manifest.derivedExpected.library_documents = total;
  if (MODE === 'plan') {
    manifest.derived.library_documents = total;
    return;
  }
  let copied = 0;
  for (let offset = 0; offset < total; offset += 25) {
    const rows = await database.execute({
      sql: 'SELECT ur.user_id, r.id FROM user_repos ur JOIN repos r ON r.id = ur.repo_id WHERE ur.is_starred = 1 OR ur.is_saved = 1 ORDER BY ur.user_id, r.id LIMIT 25 OFFSET ?',
      args: [offset],
    });
    const documents = [];
    for (const row of rows.rows) {
      const source = await findKnowledgeDocument(`repo:${row.id}`);
      if (!source) continue;
      documents.push({
        external_id: `user:${row.user_id}:repo:${row.id}`,
        content: source.document.content,
        metadata: {
          kind: 'starred_repo',
          visibility: 'private',
          user_id: row.user_id,
          repo_id: row.id,
          source_document_id: source.document.id,
        },
      });
    }
    if (MODE === 'apply') copied += await ingestStarboardRagDocuments(documents);
    else
      for (const document of documents) {
        try {
          const stored = await knowledgebaseJson<{
            document: { content: string; metadata: Record<string, unknown> };
          }>(
            `${personalIndexPath()}/documents/by-external-id?external_id=${encodeURIComponent(document.external_id)}`
          );
          if (
            stored.document.content === document.content &&
            stored.document.metadata.source_document_id === document.metadata.source_document_id
          )
            copied++;
        } catch (error) {
          if (!(error instanceof Error && error.message.endsWith('(404)'))) throw error;
        }
      }
  }
  manifest.derived.library_documents = copied;
  await save(manifest);
}

async function recordMembership(
  database: ReturnType<typeof createD1RestClientFromEnv>,
  manifest: Manifest
) {
  const membership = await database.execute({ sql: 'SELECT id FROM repos ORDER BY id', args: [] });
  const catalogIds = membership.rows.map((row) => Number(row.id));
  const membershipHash = catalogMembershipHash(catalogIds);
  if (
    process.env.KNOWLEDGE_MIGRATION_RESUME === 'true' &&
    manifest.catalogIdsHash &&
    manifest.catalogIdsHash !== membershipHash
  )
    throw new Error('Catalog membership changed; start a fresh reconciliation pass');
  manifest.catalogSize = catalogIds.length;
  manifest.catalogIdsHash = membershipHash;
  return manifest;
}

async function main() {
  if (!['plan', 'apply', 'reconcile', 'finalize'].includes(MODE))
    throw new Error('Use plan, apply, reconcile, or finalize');
  if (!Number.isSafeInteger(AFTER) || AFTER < 0 || !Number.isInteger(LIMIT))
    throw new Error('Invalid migration bounds');
  const database = createD1RestClientFromEnv();
  if (MODE === 'finalize') {
    await finalize(database);
    return;
  }
  const manifest = await loadManifest();
  manifest.derivedExpected ||= {};
  await recordMembership(database, manifest);
  const after =
    process.env.KNOWLEDGE_MIGRATION_RESUME === 'true' ? manifest.lastProcessedId : AFTER;
  const result = await database.execute({
    sql: 'SELECT * FROM repos WHERE id > ? ORDER BY id LIMIT ?',
    args: [after, LIMIT],
  });
  const entries = new Map(manifest.entries.map((entry) => [entry.repoId, entry]));
  for (const row of result.rows) {
    let entry: Entry;
    try {
      entry = await migrateRepo(row);
    } catch {
      entry = {
        repoId: Number(row.id),
        fullName: String(row.full_name),
        status: 'failed',
        error: 'Source collection, admission, or service failed; retry this repository.',
      };
    }
    entries.set(entry.repoId, entry);
    manifest.mode = MODE;
    manifest.entries = [...entries.values()];
    manifest.lastProcessedId = entry.repoId;
    await save(manifest);
    console.info(`${entry.repoId} ${entry.fullName}: ${entry.status}`);
  }
  if (process.env.KNOWLEDGE_MIGRATION_DERIVED === 'true') {
    await migrateDerived(database, manifest);
    await migrateLibrary(database, manifest);
  }
  await save(manifest);
  const failed = manifest.entries.filter((entry) =>
    ['failed', 'incomplete', 'missing'].includes(entry.status)
  );
  console.info(
    `Manifest: ${OUTPUT}; processed=${manifest.entries.length}; unresolved=${failed.length}; cursor=${manifest.lastProcessedId}`
  );
  const derivedMissing = Object.keys(manifest.derivedExpected).filter(
    (table) => manifest.derived[table] !== manifest.derivedExpected[table]
  );
  console.info(
    `Catalog size=${manifest.catalogSize}; derived tables with mismatches=${derivedMissing.length}. This command never enables cutover.`
  );
  if (failed.length || (MODE !== 'plan' && derivedMissing.length)) process.exitCode = 1;
}
async function finalize(database: ReturnType<typeof createD1RestClientFromEnv>) {
  const directory = resolve('.fleet-local/knowledge-migration');
  const reconciled = JSON.parse(
    await readFile(resolve(directory, 'manifest-reconcile.json'), 'utf8')
  ) as Manifest;
  const applied = JSON.parse(
    await readFile(resolve(directory, 'manifest-apply.json'), 'utf8')
  ) as Manifest;
  const membership = await database.execute({ sql: 'SELECT id FROM repos ORDER BY id', args: [] });
  const counts: Record<string, number> = {};
  for (const table of DERIVED_TABLES) {
    const result = await database.execute({
      sql: `SELECT COUNT(*) AS count FROM ${table}`,
      args: [],
    });
    counts[table] = Number(result.rows[0]?.count);
  }
  const library = await database.execute({
    sql: 'SELECT COUNT(*) AS count FROM user_repos WHERE is_starred = 1 OR is_saved = 1',
    args: [],
  });
  counts.library_documents = Number(library.rows[0]?.count);
  assertKnowledgeMigrationReady(
    reconciled,
    applied,
    membership.rows.map((row) => Number(row.id)),
    counts
  );
  console.info(
    'The complete catalog, derived snapshots and private library are reconciled. No runtime flag has been changed.'
  );
}
main().catch(() => {
  console.error(
    'Knowledge migration failed; check service availability and admission configuration.'
  );
  process.exitCode = 1;
});
