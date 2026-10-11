import {
  catalogDocument,
  findKnowledgeDocument,
  ingestKnowledgeDocuments,
  refreshKnowledgeRepository,
} from '@/lib/knowledge-catalog';
import { catalogIndexPath, knowledgebaseJson } from '@/lib/knowledgebase';
import type { RepoAiMetadataResult, RepoMetadataSource } from '@/lib/repo-ai-metadata';
import { REPO_AI_CATEGORIES } from '@/lib/repo-ai-taxonomy';

interface EnrichedProfile {
  schema_version: number;
  subject_id: string;
  source_revision?: string;
  profile: {
    purpose: string;
    capabilities: string[];
    use_when: string[];
    avoid_when: string[];
    compatibility: string[];
    scenarios: string[];
  };
  facts: unknown[];
  inferences: unknown[];
  taxonomy: { category: string; subcategories: string[]; keywords: string[] };
  engine: { status: string; resolved_model: string | null; provider: string | null };
}

export async function enrichKnowledgeRepository(
  repo: RepoMetadataSource & { id?: number },
  refreshSource = true
): Promise<RepoAiMetadataResult> {
  if (!Number.isSafeInteger(repo.id) || Number(repo.id) < 1)
    throw new Error('Knowledgebase enrichment requires a canonical catalog repository ID');
  if (refreshSource) {
    const refresh = await refreshKnowledgeRepository({ ...repo, id: repo.id }, undefined, true);
    if (refresh.sourceStatus === 'unavailable' || refresh.retainedPrevious)
      throw new Error('Current pinned public source coverage is required for enrichment');
  }
  const source = catalogDocument({ ...repo, id: repo.id });
  const stored = await findKnowledgeDocument(source.external_id);
  const documentId = stored?.document.id || (await ingestKnowledgeDocuments([source]))[0];
  const sourceMetadata = Object.fromEntries(
    Object.entries(stored?.document.metadata || source.metadata).filter(
      ([key]) =>
        !key.startsWith('_kb_') && !['file_id', 'filename', 'page_start', 'page_end'].includes(key)
    )
  );
  const previous = await findKnowledgeDocument(`repo:${repo.id}:profile`);
  if (
    previous?.document.metadata.source_document_id === documentId &&
    previous.document.metadata.enricher_version === 'knowledgebase-profile-v1'
  )
    return profileMetadata(JSON.parse(previous.document.content) as EnrichedProfile);
  const enrichment = await knowledgebaseJson<EnrichedProfile>(`${catalogIndexPath()}/enrich`, {
    document_ids: [documentId],
    subject_id: `github:${repo.id}`,
    source_revision: sourceMetadata.source_revision,
    classification: { categories: REPO_AI_CATEGORIES },
  });
  validateProfile(enrichment, Number(repo.id));
  await ingestKnowledgeDocuments([
    {
      external_id: `repo:${repo.id}:profile`,
      content: JSON.stringify({ ...enrichment, engine: { ...enrichment.engine, raw: undefined } }),
      metadata: {
        ...sourceMetadata,
        kind: 'catalog_profile',
        enricher_version: 'knowledgebase-profile-v1',
        validation: 'model_evidence_checked',
        human_validated: false,
        source_document_id: documentId,
        facts: enrichment.facts,
        inferences: enrichment.inferences,
        engine: { ...enrichment.engine, raw: undefined },
      },
    },
  ]);
  return profileMetadata(enrichment);
}

function validateProfile(enrichment: EnrichedProfile, repoId: number) {
  if (
    enrichment.schema_version !== 1 ||
    enrichment.subject_id !== `github:${repoId}` ||
    !enrichment.profile ||
    typeof enrichment.profile.purpose !== 'string' ||
    !Array.isArray(enrichment.profile.capabilities)
  )
    throw new Error('Invalid Knowledgebase profile');
}

function profileMetadata(enrichment: EnrichedProfile): RepoAiMetadataResult {
  return {
    metadata: {
      summary: enrichment.profile.purpose.slice(0, 120),
      category: enrichment.taxonomy.category,
      subcategories: enrichment.taxonomy.subcategories.slice(0, 5),
      use_cases: enrichment.profile.use_when.slice(0, 5),
      keywords: enrichment.taxonomy.keywords.slice(0, 10),
    },
    model: `knowledgebase:${enrichment.engine.provider || 'unknown'}:${enrichment.engine.resolved_model || 'unreported'}`,
  };
}
