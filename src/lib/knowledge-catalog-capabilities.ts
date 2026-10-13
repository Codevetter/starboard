import {
  findKnowledgeDocument,
  ingestKnowledgeDocuments,
  type KnowledgeStoredDocument,
} from '@/lib/knowledge-catalog';
import { catalogIndexPath, knowledgebaseJson } from '@/lib/knowledgebase';
import { knowledgeOperation, type KnowledgeOperation } from '@/lib/knowledge-operations';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';

const VERSION = 'catalog-operations-v1';
interface Capability {
  value: string;
  operation: KnowledgeOperation;
  evidence: Array<{ document_id: string; chunk_id: string; excerpt: string }>;
}
interface CatalogCapabilities {
  schema_version: number;
  facts: Array<Capability & { field: string }>;
}

function validateCapabilities(profile: CatalogCapabilities, source: KnowledgeStoredDocument) {
  if (profile.schema_version !== 1 || !Array.isArray(profile.facts))
    throw new Error('Invalid catalog capability card');
  const capabilities = profile.facts.filter((fact) => fact.field === 'capabilities');
  if (!capabilities.length || capabilities.length > 10)
    throw new Error('Invalid catalog capability coverage');
  return capabilities.map((fact) => {
    if (
      typeof fact.value !== 'string' ||
      !fact.value.trim() ||
      fact.value.length > 240 ||
      !Array.isArray(fact.evidence) ||
      !fact.evidence.length ||
      fact.evidence.length > 3 ||
      fact.evidence.some(
        (ref) =>
          ref.document_id !== source.document.id ||
          typeof ref.excerpt !== 'string' ||
          !ref.excerpt.trim() ||
          ref.excerpt.length > 1200 ||
          !source.chunks.some(
            (chunk) => chunk.id === ref.chunk_id && chunk.content.includes(ref.excerpt)
          )
      )
    )
      throw new Error('Catalog capability requires literal current source evidence');
    return {
      value: fact.value,
      operation: knowledgeOperation(fact.operation),
      evidence: fact.evidence,
    };
  });
}

function qualifiedSource(
  source: KnowledgeStoredDocument | null
): source is KnowledgeStoredDocument {
  const metadata = source?.document.metadata;
  return (
    !!metadata &&
    metadata.kind === 'catalog_repo' &&
    metadata.visibility === 'public' &&
    metadata.source_path === 'public-source-bundle' &&
    ['complete', 'partial'].includes(String(metadata.source_status)) &&
    /^[a-f0-9]{40}$/i.test(String(metadata.source_revision))
  );
}

export async function catalogCapabilities(
  repoId: number,
  enrich = false
): Promise<Capability[] | null> {
  if (!Number.isSafeInteger(repoId) || repoId < 1) throw new Error('Invalid catalog repository ID');
  const source = await findKnowledgeDocument(`repo:${repoId}`);
  if (!qualifiedSource(source)) return null;
  const externalId = `repo:${repoId}:operations`;
  const previous = await findKnowledgeDocument(externalId);
  if (
    previous?.document.metadata.enricher_version === VERSION &&
    previous.document.metadata.source_document_id === source.document.id
  )
    return validateCapabilities(
      JSON.parse(previous.document.content) as CatalogCapabilities,
      source
    );
  if (!enrich) return null;
  const profile = await knowledgebaseJson<CatalogCapabilities>(`${catalogIndexPath()}/enrich`, {
    document_ids: [source.document.id],
    subject_id: String(source.document.metadata.full_name || `github:${repoId}`),
    source_revision: source.document.metadata.source_revision,
    profile_mode: 'operations',
  });
  const capabilities = validateCapabilities(profile, source);
  await ingestKnowledgeDocuments([
    {
      external_id: externalId,
      content: JSON.stringify({ schema_version: 1, facts: profile.facts }),
      metadata: {
        kind: 'catalog_capability_card',
        visibility: 'public',
        repo_id: repoId,
        source_document_id: source.document.id,
        source_revision: source.document.metadata.source_revision,
        enricher_version: VERSION,
        validation: 'literal_source_quotes_checked',
        human_validated: false,
      },
    },
  ]);
  return capabilities;
}

export async function prepareCatalogCapabilities(
  candidates: ProjectRecommendationRepo[]
): Promise<number[]> {
  const prepared: number[] = [];
  const unique = [
    ...new Map(candidates.map((candidate) => [candidate.id, candidate])).values(),
  ].slice(0, 24);
  for (let offset = 0; offset < unique.length; offset += 3) {
    const results = await Promise.allSettled(
      unique
        .slice(offset, offset + 3)
        .map(async (candidate) =>
          (await catalogCapabilities(candidate.id, true)) ? candidate.id : null
        )
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) prepared.push(result.value);
      else if (result.status === 'rejected')
        console.error('Catalog capability preparation failed', { error: String(result.reason) });
    }
  }
  return prepared;
}

export async function candidateCapabilityEvidence(repoId: number, operation: KnowledgeOperation) {
  const capabilities = await catalogCapabilities(repoId);
  const terms =
    `${operation.input} ${operation.action} ${operation.output}`
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g) ?? [];
  const sorted = capabilities
    ?.map((capability) => ({
      capability,
      score: new Set(
        terms.filter((term) =>
          `${capability.operation.input} ${capability.operation.action} ${capability.operation.output}`
            .toLowerCase()
            .includes(term)
        )
      ).size,
    }))
    .sort((a, b) => b.score - a.score);
  return sorted?.[0]?.score ? sorted[0].capability.evidence.slice(0, 1) : [];
}
