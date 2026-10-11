import { projectKnowledgeDocuments } from '@/lib/knowledge-decisions';
import { catalogIndexPath, knowledgebaseJson } from '@/lib/knowledgebase';
import { findKnowledgeDocument, ingestKnowledgeDocuments } from '@/lib/knowledge-catalog';
import type { ProjectRecommendationRepo } from '@/lib/project-recommendations';
import type { ProjectNeed, CapabilityCard } from '@/lib/need-driven-intelligence';
import { textHash } from '@/lib/embeddings';

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
}

export async function knowledgeProjectNeeds(
  project: ProjectRecommendationRepo
): Promise<ProjectNeed[]> {
  const documents = await projectKnowledgeDocuments(project);
  if (!documents.length) throw new Error('Project source coverage is unavailable');
  const ids = await ingestKnowledgeDocuments(documents);
  const externalId = `project:${project.id}:${project.sourceContext?.scope || 'root'}:needs`;
  const previous = await findKnowledgeDocument(externalId);
  const previousIds = previous?.document.metadata.source_document_ids;
  const enriched =
    Array.isArray(previousIds) && JSON.stringify(previousIds) === JSON.stringify(ids)
      ? (JSON.parse(previous!.document.content) as Profile)
      : await knowledgebaseJson<Profile>(`${catalogIndexPath()}/enrich`, {
          document_ids: ids,
          subject_id: `github:${project.id}`,
          source_revision: project.sourceContext?.revision || undefined,
        });
  if (enriched.schema_version !== 1 || !Array.isArray(enriched.needs))
    throw new Error('Knowledgebase need extraction is unavailable');
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
        validation: 'model_evidence_checked',
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
