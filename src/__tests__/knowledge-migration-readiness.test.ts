import { describe, expect, it } from 'vitest';
import {
  assertKnowledgeMigrationReady,
  catalogMembershipHash,
  KNOWLEDGE_DERIVED_TABLES,
} from '../../scripts/knowledge-migration-readiness';

function fixture() {
  const counts = Object.fromEntries(
    [...KNOWLEDGE_DERIVED_TABLES, 'library_documents'].map((key) => [key, 0])
  );
  const entry = { repoId: 42, documentId: 'current', contentHash: 'hash', revision: 'sha' };
  return {
    counts,
    applied: {
      mode: 'apply',
      catalogIdsHash: catalogMembershipHash([42]),
      entries: [{ ...entry, status: 'migrated' }],
      derived: { ...counts },
      derivedExpected: { ...counts },
    },
    reconciled: {
      mode: 'reconcile',
      catalogIdsHash: catalogMembershipHash([42]),
      entries: [{ ...entry, status: 'reconciled' }],
      derived: { ...counts },
      derivedExpected: { ...counts },
    },
  };
}

describe('full migration cutover gate', () => {
  it('accepts complete exact source and library reconciliation', () => {
    const { reconciled, applied, counts } = fixture();
    expect(() => assertKnowledgeMigrationReady(reconciled, applied, [42], counts)).not.toThrow();
  });
  it('rejects a successful partial batch and catalog drift', () => {
    const { reconciled, applied, counts } = fixture();
    expect(() => assertKnowledgeMigrationReady(reconciled, applied, [42, 43], counts)).toThrow(
      'membership'
    );
    reconciled.entries = [];
    expect(() => assertKnowledgeMigrationReady(reconciled, applied, [42], counts)).toThrow(
      'complete catalog'
    );
  });
  it('rejects failures, replaced snapshots and changed source content', () => {
    for (const update of [
      { status: 'failed' },
      { documentId: 'stale' },
      { contentHash: 'different' },
    ]) {
      const { reconciled, applied, counts } = fixture();
      Object.assign(reconciled.entries[0]!, update);
      expect(() => assertKnowledgeMigrationReady(reconciled, applied, [42], counts)).toThrow(
        'source evidence'
      );
    }
  });
  it('requires private-library coverage even when every catalog source matches', () => {
    const { reconciled, applied, counts } = fixture();
    delete reconciled.derived.library_documents;
    expect(() => assertKnowledgeMigrationReady(reconciled, applied, [42], counts)).toThrow(
      'library_documents'
    );
  });
  it('rejects derived data changed after reconciliation', () => {
    const { reconciled, applied, counts } = fixture();
    counts.repo_tools = 1;
    expect(() => assertKnowledgeMigrationReady(reconciled, applied, [42], counts)).toThrow(
      'repo_tools'
    );
  });
});
