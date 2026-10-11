import { createHash } from 'node:crypto';

export const KNOWLEDGE_DERIVED_TABLES = [
  'repo_ai_metadata',
  'repo_tools',
  'repo_tool_enrichment_state',
  'repo_capability_cards',
  'project_fingerprints',
  'project_needs',
  'need_candidate_pools',
  'project_draft_reports',
  'project_reviewed_reports',
  'external_review_requests',
] as const;

interface MigrationEntry {
  repoId: number;
  status: string;
  documentId?: string;
  contentHash?: string;
  revision?: string | null;
}
export interface MigrationReadinessManifest {
  mode: string;
  entries: MigrationEntry[];
  catalogIdsHash?: string;
  derived: Record<string, number>;
  derivedExpected: Record<string, number>;
}

export function catalogMembershipHash(ids: number[]): string {
  return createHash('sha256').update(JSON.stringify(ids)).digest('hex');
}

export function assertKnowledgeMigrationReady(
  manifest: MigrationReadinessManifest,
  applied: MigrationReadinessManifest,
  catalogIds: number[],
  currentCounts: Record<string, number>
): void {
  const hash = catalogMembershipHash(catalogIds);
  if (manifest.mode !== 'reconcile' || applied.mode !== 'apply')
    throw new Error('Apply and reconciliation manifests are required');
  if (manifest.catalogIdsHash !== hash || applied.catalogIdsHash !== hash)
    throw new Error('Catalog membership changed since migration');
  const reconciled = new Map(manifest.entries.map((entry) => [entry.repoId, entry]));
  const migrated = new Map(applied.entries.map((entry) => [entry.repoId, entry]));
  if (
    manifest.entries.length !== catalogIds.length ||
    applied.entries.length !== catalogIds.length ||
    reconciled.size !== catalogIds.length ||
    migrated.size !== catalogIds.length
  )
    throw new Error('The complete catalog must be migrated and reconciled');
  for (const id of catalogIds) {
    assertSourceEvidence(id, reconciled.get(id), migrated.get(id));
  }
  assertDerivedCounts(manifest, applied, currentCounts);
}

function assertSourceEvidence(id: number, current?: MigrationEntry, source?: MigrationEntry) {
  if (
    current?.status !== 'reconciled' ||
    source?.status !== 'migrated' ||
    !current.contentHash ||
    !current.documentId ||
    !current.revision ||
    current.contentHash !== source.contentHash ||
    current.documentId !== source.documentId ||
    current.revision !== source.revision
  )
    throw new Error(`Repository ${id} has missing, failed, or changed source evidence`);
}

function assertDerivedCounts(
  manifest: MigrationReadinessManifest,
  applied: MigrationReadinessManifest,
  currentCounts: Record<string, number>
) {
  for (const key of [...KNOWLEDGE_DERIVED_TABLES, 'library_documents']) {
    const expected = currentCounts[key];
    if (
      !Number.isSafeInteger(expected) ||
      expected < 0 ||
      manifest.derivedExpected[key] !== expected ||
      manifest.derived[key] !== expected ||
      applied.derivedExpected[key] !== expected ||
      applied.derived[key] !== expected
    )
      throw new Error(`Knowledge migration is incomplete or stale for ${key}`);
  }
}
