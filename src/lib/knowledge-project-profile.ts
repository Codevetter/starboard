import { createHash } from 'node:crypto';
import { explicitRequirements, requirementDocuments } from '@/lib/project-requirements';
import { projectKnowledgeDocuments } from '@/lib/knowledge-decisions';
import { catalogIndexPath, knowledgebaseJson } from '@/lib/knowledgebase';
import { findKnowledgeDocument, ingestKnowledgeDocuments } from '@/lib/knowledge-catalog';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';
import type { ProjectNeed, CapabilityCard } from '@/lib/need-driven-intelligence';
import { textHash } from '@/lib/embeddings';
import { knowledgeOperation, type KnowledgeOperation } from '@/lib/knowledge-operations';

interface Evidence {
  document_id: string;
  chunk_id: string;
  excerpt: string;
}
interface Profile {
  schema_version: number;
  profile: { purpose: string; capabilities: string[] };
  needs: Array<{
    title: string;
    desired_outcome: string;
    constraints: string[];
    evidence: Evidence[];
  }>;
  engine: { status: string };
  facts?: Array<{
    field: string;
    value: string;
    evidence: Evidence[];
    search_query?: string;
    operation?: KnowledgeOperation;
  }>;
}

export interface KnowledgeProjectFeature {
  id: string;
  description: string;
  searchQuery?: string;
  operation?: KnowledgeOperation;
  evidence: Evidence[];
}

export async function knowledgeProjectFeatures(
  project: ProjectRecommendationRepo
): Promise<KnowledgeProjectFeature[]> {
  const documents = await projectKnowledgeDocuments(project);
  if (!documents.length) throw new Error('Project source coverage is unavailable');
  const ids = await ingestKnowledgeDocuments(documents);
  const externalId = `project:${project.id}:${project.sourceContext?.scope || 'root'}:features`;
  const previous = await findKnowledgeDocument(externalId);
  const enriched =
    previous?.document.metadata.enricher_version === 'knowledgebase-features-v5' &&
    JSON.stringify(previous.document.metadata.source_document_ids) === JSON.stringify(ids)
      ? (JSON.parse(previous.document.content) as Profile)
      : await knowledgebaseJson<Profile>(`${catalogIndexPath()}/enrich`, {
          document_ids: ids,
          subject_id: project.fullName,
          source_revision: project.sourceContext?.revision || undefined,
          ...(project.sourceContext?.scope ? { subject_scope: project.sourceContext.scope } : {}),
          profile_mode: 'operations',
        });
  if (enriched.schema_version !== 1 || !Array.isArray(enriched.facts))
    throw new Error('Knowledgebase feature extraction is unavailable');
  const features = enriched.facts
    .filter((fact) => fact.field === 'capabilities' || fact.field === 'purpose')
    .map((fact) => {
      if (
        typeof fact.value !== 'string' ||
        !fact.value.trim() ||
        fact.value.length > 240 ||
        !Array.isArray(fact.evidence) ||
        !fact.evidence.length ||
        fact.evidence.length > 3 ||
        (fact.search_query !== undefined &&
          (typeof fact.search_query !== 'string' ||
            !fact.search_query.trim() ||
            fact.search_query.length > 64)) ||
        fact.evidence.some((ref) => !ids.includes(ref.document_id) || !ref.chunk_id || !ref.excerpt)
      )
        throw new Error('Invalid source-grounded feature');
      return {
        id: textHash(JSON.stringify(fact)),
        description: fact.value,
        ...(fact.search_query ? { searchQuery: fact.search_query } : {}),
        evidence: fact.evidence,
        ...(fact.field === 'capabilities' ? { operation: knowledgeOperation(fact.operation) } : {}),
      };
    });
  if (!enriched.facts.some((fact) => fact.field === 'capabilities') || features.length > 11)
    throw new Error('Knowledgebase implementation coverage is unavailable');
  if (
    previous?.document.metadata.enricher_version !== 'knowledgebase-features-v5' ||
    JSON.stringify(previous.document.metadata.source_document_ids) !== JSON.stringify(ids)
  )
    await ingestKnowledgeDocuments([
      {
        external_id: externalId,
        content: JSON.stringify(enriched),
        metadata: {
          kind: 'project_features',
          repo_id: project.id,
          visibility: 'public',
          source_document_ids: ids,
          enricher_version: 'knowledgebase-features-v5',
          validation: 'literal_source_quotes_checked',
          human_validated: false,
        },
      },
    ]);
  return features;
}

function boundedText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 240;
}

function validNeed(
  need: Profile['needs'][number],
  ids: string[],
  documents: { content: string }[]
): boolean {
  if (!need || !boundedText(need.title) || !boundedText(need.desired_outcome)) return false;
  if (
    !Array.isArray(need.constraints) ||
    need.constraints.length > 10 ||
    !need.constraints.every(boundedText)
  )
    return false;
  if (!Array.isArray(need.evidence) || !need.evidence.length || need.evidence.length > 3)
    return false;
  return need.evidence.every((ref) => {
    if (!ref || !boundedText(ref.chunk_id) || !boundedText(ref.excerpt)) return false;
    const source = documents[ids.indexOf(ref.document_id)];
    return (
      !!source &&
      explicitRequirements(source.content).some(
        ({ quote, statement }) => ref.excerpt === quote || ref.excerpt === statement
      )
    );
  });
}

export async function knowledgeProjectNeeds(
  project: ProjectRecommendationRepo
): Promise<ProjectNeed[]> {
  const sourceDocuments = requirementDocuments(project);
  const documents = (
    await projectKnowledgeDocuments({
      ...project,
      sourceContext: { ...project.sourceContext!, documents: sourceDocuments },
    })
  ).map((document) => ({ ...document, external_id: `${document.external_id}:requirements` }));
  if (!documents.length) throw new Error('Project source coverage is unavailable');
  if (!documents.some((document) => explicitRequirements(document.content).length)) return [];
  const sourceHash = createHash('sha256')
    .update(JSON.stringify(documents.map((document) => [document.external_id, document.content])))
    .digest('hex');
  const ids = await ingestKnowledgeDocuments(documents);
  const externalId = `project:${project.id}:${project.sourceContext?.scope || 'root'}:needs`;
  const previous = await findKnowledgeDocument(externalId);
  const previousIds = previous?.document.metadata.source_document_ids;
  const enriched =
    previous?.document.metadata.enricher_version === 'explicit-needs-v2' &&
    previous.document.metadata.source_hash === sourceHash &&
    Array.isArray(previousIds) &&
    JSON.stringify(previousIds) === JSON.stringify(ids)
      ? (JSON.parse(previous!.document.content) as Profile)
      : await knowledgebaseJson<Profile>(`${catalogIndexPath()}/enrich`, {
          document_ids: ids,
          subject_id: `github:${project.id}`,
          source_revision: project.sourceContext?.revision || undefined,
        });
  if (enriched.schema_version !== 1 || !Array.isArray(enriched.needs))
    throw new Error('Knowledgebase need extraction is unavailable');
  if (enriched.needs.length > 10 || enriched.needs.some((need) => !validNeed(need, ids, documents)))
    throw new Error('Invalid source-grounded need');
  const needs = enriched.needs.map((need) => ({
    id: textHash(need.title),
    title: need.title,
    currentState: need.evidence.map((evidence) => evidence.excerpt).join(' '),
    desiredOutcome: need.desired_outcome,
    priority: 'medium' as const,
    constraints: need.constraints,
    evidence: need.evidence.map(
      (evidence) => `${evidence.document_id}:${evidence.chunk_id}: ${evidence.excerpt}`
    ),
    searchIntents: [need.title, need.desired_outcome],
    signature: textHash(JSON.stringify(need)),
  }));
  await ingestKnowledgeDocuments([
    {
      external_id: externalId,
      content: JSON.stringify(enriched),
      metadata: {
        kind: 'project_needs',
        repo_id: project.id,
        visibility: 'public',
        source_document_ids: ids,
        enricher_version: 'explicit-needs-v2',
        source_hash: sourceHash,
        validation: 'explicit_requirement_quotes_checked',
        human_validated: false,
      },
    },
  ]);
  return needs;
}

export async function knowledgeCapabilityCard(card: CapabilityCard): Promise<CapabilityCard> {
  const [source, stored] = await Promise.all([
    findKnowledgeDocument(`repo:${card.repoId}`),
    findKnowledgeDocument(`repo:${card.repoId}:profile`),
  ]);
  if (!source || !stored || stored.document.metadata.source_document_id !== source.document.id)
    throw new Error('Current Knowledgebase capability profile is unavailable');
  const profile = JSON.parse(stored.document.content) as Profile;
  if (
    profile.schema_version !== 1 ||
    !profile.profile ||
    !Array.isArray(profile.profile.capabilities)
  )
    throw new Error('Invalid capability profile');
  const derived = {
    ...card,
    purpose: profile.profile.purpose,
    capabilities: profile.profile.capabilities,
    sourceFingerprint: textHash(stored.document.content),
    embeddingRefs: [source.document.id, stored.document.id],
    provenance: [
      'knowledgebase',
      `source:${source.document.id}`,
      `profile:${stored.document.id}`,
      'human_validated:false',
    ],
  };
  await ingestKnowledgeDocuments([
    {
      external_id: `repo:${card.repoId}:capability-card`,
      content: JSON.stringify(derived),
      metadata: {
        kind: 'capability_card',
        repo_id: card.repoId,
        visibility: 'public',
        source_document_id: source.document.id,
        profile_document_id: stored.document.id,
        validation: 'model_evidence_checked',
      },
    },
  ]);
  return derived;
}
