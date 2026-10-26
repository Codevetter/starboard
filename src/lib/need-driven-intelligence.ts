import { knowledgeCapabilityCard } from '@/lib/knowledge-project-profile';
import { ingestKnowledgeDocuments } from '@/lib/knowledge-catalog';
/**
 * Need-driven project intelligence pipeline.
 *
 * This module implements the deterministic Starboard side of the need-driven
 * recommendation system described in GitHub issue #82 and the OpenSpec change
 * `need-driven-project-recommendations`.
 *
 * Pipeline stages:
 *   1. Repository capability cards (cached by source fingerprint)
 *   2. Project fingerprinting (gates need recomputation)
 *   3. Need extraction with stable ids and normalized signatures
 *   4. Per-need full-catalog retrieval (Vectorize + FTS + structured)
 *   5. Candidate deduplication, scoring, and five-bucket classification
 *   6. Draft report persistence with incremental rerun support
 *   7. Provider-neutral external review contract (ingestion only)
 *
 * Devin credentials and session orchestration live outside Starboard. This
 * module never requires an external reviewer to serve recommendations.
 */

import { createHash } from 'node:crypto';

import type { DbClient, InStatement } from '@/db/client';
import { buildRepoEmbeddingText, generateEmbeddings } from '@/lib/embeddings';
import { knowledgePipelineEnabled } from '@/lib/knowledgebase';
import { queryKnowledgeCatalog } from '@/lib/knowledge-catalog';
import { reviewKnowledgeProject } from '@/lib/knowledge-decisions';
import type { ProjectRecommendationRepo, ProjectToolSignal } from '@/lib/project-recommendations';
import { repoVectors, type RepoVectorMatch } from '@/lib/repo-vectors';
import { ftsSearchQuery, rrfFuse } from '@/lib/search';

// ---------------------------------------------------------------------------
// Constants and bounds
// ---------------------------------------------------------------------------

const RETRIEVAL_VERSION = 'explicit-needs-v2';
const KNOWLEDGE_RETRIEVAL_VERSION = 'knowledgebase-explicit-needs-v2';
const MAX_NEEDS = 10;
const MIN_NEED_EVIDENCE = 1;
const VECTOR_TOP_K = 80;
const VECTOR_DISTANCE_MAX = 0.65;
const LEXICAL_LIMIT = 200;
const STRUCTURED_LIMIT = 120;
const HYDRATION_LIMIT = 250;
const CANDIDATES_PER_NEED = 8;
const MAX_TOTAL_CANDIDATES = 50;
const MIN_STARS_FLOOR = 5000;

const ELIGIBLE_REPO_SQL =
  'r.id IN (SELECT r2.id FROM repos r2 WHERE r2.stargazers_count >= ? UNION SELECT community_ur.repo_id FROM user_repos community_ur WHERE community_ur.is_starred = 1)';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NeedPriority = 'high' | 'medium' | 'low';

export type CandidateClassification =
  | 'adopt_or_integrate'
  | 'reference_implementation'
  | 'architectural_pattern'
  | 'competing_product_to_monitor'
  | 'unsuitable_negative_example';

type Confidence = 'high' | 'medium' | 'low';

type ReportStatus = 'pending' | 'retrieving' | 'complete' | 'degraded' | 'failed';

type ReviewStatus = 'pending' | 'submitted' | 'complete' | 'rejected' | 'failed' | 'timeout';

type ReviewedReportStatus = 'pending' | 'awaiting_review' | 'complete' | 'degraded' | 'failed';

export interface CapabilityCard {
  repoId: number;
  sourceFingerprint: string;
  purpose: string;
  capabilities: string[];
  language: string | null;
  tools: ProjectToolSignal[];
  adoptionType: string | null;
  maintenance: {
    archived: boolean;
    stargazersCount: number;
    updatedAt: string | null;
  };
  embeddingRefs: string[];
  provenance: string[];
}

export interface ProjectFingerprint {
  repoId: number;
  fingerprint: string;
  evidence: string[];
}

export interface ProjectNeed {
  id: string;
  title: string;
  currentState: string;
  desiredOutcome: string;
  priority: NeedPriority;
  constraints: string[];
  evidence: string[];
  searchIntents: string[];
  signature: string;
}

export interface NeedCandidate {
  repoId: number;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  archived: boolean;
  topics: string[];
  tools: ProjectToolSignal[];
  classification: CandidateClassification;
  confidence: Confidence;
  evidence: string[];
  score: number;
}

interface NeedReport {
  need: ProjectNeed;
  candidates: NeedCandidate[];
  retrievalMode: ProjectRetrievalMode;
}

type ProjectRetrievalMode =
  | 'hybrid'
  | 'semantic'
  | 'lexical-structured'
  | 'structured'
  | 'fallback';

export interface DraftReport {
  repoId: number;
  fingerprint: string;
  catalogGeneration: string;
  retrievalVersion: string;
  status: ReportStatus;
  needs: NeedReport[];
  needsCount: number;
  candidatesCount: number;
  provenance: string[];
  createdAt: string;
}

export interface ExternalReviewRequest {
  idempotencyKey: string;
  repoId: number;
  draftReportId: number;
  requestHash: string;
  status: ReviewStatus;
}

export interface ExternalReviewResult {
  idempotencyKey: string;
  reviewerProvider: string;
  reviewerModel: string;
  reviewerUsage: Record<string, number>;
  verdicts: ReviewVerdict[];
}

export interface ReviewVerdict {
  needId: string;
  verdict: 'supported' | 'unsupported' | 'refined';
  rationale: string;
  rejectedCandidateIds?: number[];
  refinedNeed?: Partial<Pick<ProjectNeed, 'title' | 'priority' | 'desiredOutcome'>>;
}

export interface ReviewedReport {
  repoId: number;
  draftReportId: number;
  reviewRequestId: number | null;
  status: ReviewedReportStatus;
  report: DraftReport;
  reviewerProvider: string | null;
  reviewerModel: string | null;
  reviewerUsage: Record<string, number>;
  provenance: string[];
  createdAt: string;
}

interface VectorStore {
  query(vector: number[], topK: number): Promise<RepoVectorMatch[]>;
  queryByRepoId(repoId: number, topK: number): Promise<RepoVectorMatch[]>;
}

export interface NeedDrivenIntelligenceDependencies {
  database: Pick<DbClient, 'execute' | 'batch'>;
  vectorStore: () => VectorStore;
  embed: (texts: string[]) => Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// Fingerprinting utilities
// ---------------------------------------------------------------------------

/**
 * SHA-256 fingerprint over normalized text inputs. Stable across runs when
 * the inputs are unchanged.
 */
export function fingerprintTexts(texts: Array<string | null | undefined>): string {
  const hash = createHash('sha256');
  for (const text of texts) {
    hash.update(text ?? '');
    hash.update('\u0000');
  }
  return hash.digest('hex');
}

/**
 * Normalized need signature for cross-project candidate pool reuse.
 * Combines the need title and search intents into a stable hash.
 */
export function needSignature(need: {
  title: string;
  searchIntents: string[];
  constraints: string[];
}): string {
  const normalized = [
    need.title.trim().toLowerCase(),
    ...need.searchIntents.map((s) => s.trim().toLowerCase()),
    ...need.constraints.map((c) => c.trim().toLowerCase()),
  ];
  return fingerprintTexts(normalized);
}

/**
 * Source fingerprint for a repository capability card. Combines the metadata
 * signals that, when changed, should trigger a card refresh.
 */
export function capabilitySourceFingerprint(inputs: {
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  aiSummary: string | null;
  aiCategory: string | null;
  aiKeywords: string[];
  toolKeys: string[];
  readmeHash?: string | null;
}): string {
  return fingerprintTexts([
    inputs.fullName,
    inputs.description,
    inputs.language,
    JSON.stringify([...inputs.topics].sort()),
    inputs.aiSummary,
    inputs.aiCategory,
    JSON.stringify([...inputs.aiKeywords].sort()),
    JSON.stringify([...inputs.toolKeys].sort()),
    inputs.readmeHash ?? null,
  ]);
}

// ---------------------------------------------------------------------------
// Capability card generation (Stage 1)
// ---------------------------------------------------------------------------

interface RepoMetadataRow {
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  topics: string | null;
  stargazers_count: number;
  archived: number;
  repo_updated_at: string | null;
  ai_summary: string | null;
  ai_category: string | null;
  ai_keywords: string | null;
  tools: string | null;
  text_hash: string | null;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function parseToolSignals(value: unknown): ProjectToolSignal[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t): t is Record<string, unknown> =>
          typeof t === 'object' && t !== null && typeof t.key === 'string'
      )
      .map((t) => ({
        key: String(t.key),
        name: String(t.name ?? t.key),
        category: String(t.category ?? 'library'),
        confidence: Number(t.confidence ?? 0),
      }));
  } catch {
    return [];
  }
}

function rowToMetadata(row: Record<string, unknown>): RepoMetadataRow {
  return {
    id: Number(row.id),
    full_name: String(row.full_name),
    description: typeof row.description === 'string' ? row.description : null,
    language: typeof row.language === 'string' ? row.language : null,
    topics: typeof row.topics === 'string' ? row.topics : null,
    stargazers_count: Number(row.stargazers_count ?? 0),
    archived: Number(row.archived ?? 0),
    repo_updated_at: typeof row.repo_updated_at === 'string' ? row.repo_updated_at : null,
    ai_summary: typeof row.ai_summary === 'string' ? row.ai_summary : null,
    ai_category: typeof row.ai_category === 'string' ? row.ai_category : null,
    ai_keywords: typeof row.ai_keywords === 'string' ? row.ai_keywords : null,
    tools: typeof row.tools === 'string' ? row.tools : null,
    text_hash: typeof row.text_hash === 'string' ? row.text_hash : null,
  };
}

function adoptionTypeFor(archived: number, stars: number): CapabilityCard['adoptionType'] {
  if (archived) return 'archived';
  if (stars >= 50_000) return 'widely-adopted';
  if (stars >= 10_000) return 'established';
  if (stars >= 1000) return 'emerging';
  return 'niche';
}

function buildCapabilities(
  aiCategory: string | null,
  aiKeywords: string[],
  topics: string[]
): string[] {
  const capabilities: string[] = [];
  if (aiCategory) capabilities.push(aiCategory);
  for (const kw of aiKeywords.slice(0, 8)) {
    if (!capabilities.includes(kw)) capabilities.push(kw);
  }
  for (const topic of topics.slice(0, 6)) {
    if (!capabilities.includes(topic)) capabilities.push(topic);
  }
  return capabilities.slice(0, 12);
}

function buildCapabilityCard(meta: RepoMetadataRow): CapabilityCard {
  const topics = parseStringArray(meta.topics);
  const aiKeywords = parseStringArray(meta.ai_keywords);
  const tools = parseToolSignals(meta.tools);
  const sourceFingerprint = capabilitySourceFingerprint({
    fullName: meta.full_name,
    description: meta.description,
    language: meta.language,
    topics,
    aiSummary: meta.ai_summary,
    aiCategory: meta.ai_category,
    aiKeywords,
    toolKeys: tools.map((t) => t.key),
    readmeHash: meta.text_hash,
  });

  const purposeParts = [meta.description, meta.ai_summary, meta.ai_category].filter(
    (p): p is string => Boolean(p?.trim())
  );
  const purpose = purposeParts[0]?.trim() ?? meta.full_name;

  return {
    repoId: meta.id,
    sourceFingerprint,
    purpose,
    capabilities: buildCapabilities(meta.ai_category, aiKeywords, topics),
    language: meta.language,
    tools,
    adoptionType: adoptionTypeFor(meta.archived, meta.stargazers_count),
    maintenance: {
      archived: Boolean(meta.archived),
      stargazersCount: meta.stargazers_count,
      updatedAt: meta.repo_updated_at,
    },
    embeddingRefs: meta.text_hash ? [meta.text_hash] : [],
    provenance: [
      'repos table metadata',
      meta.ai_summary ? 'repo_ai_metadata' : '',
      meta.tools ? 'repo_tools' : '',
    ].filter(Boolean),
  };
}

const CAPABILITY_CARD_SELECT = `SELECT r.id,
       r.full_name,
       r.description,
       r.language,
       r.topics,
       r.stargazers_count,
       r.archived,
       r.repo_updated_at,
       aim.summary    AS ai_summary,
       aim.category   AS ai_category,
       aim.keywords   AS ai_keywords,
       re.text_hash,
       COALESCE((
         SELECT json_group_array(json_object(
           'key', rt.tool_key,
           'name', rt.tool_name,
           'category', rt.category,
           'confidence', rt.confidence
         ))
         FROM repo_tools rt WHERE rt.repo_id = r.id
       ), '[]') AS tools
FROM repos r
LEFT JOIN repo_ai_metadata aim ON aim.repo_id = r.id
LEFT JOIN repo_embeddings re ON re.repo_id = r.id
WHERE r.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`;

/**
 * Load or refresh capability cards for a set of repository IDs. Cards are
 * refreshed only when the source fingerprint has changed.
 */
async function refreshCapabilityCards(
  repoIds: number[],
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<CapabilityCard[]> {
  if (repoIds.length === 0) return [];

  const metaResult = await dependencies.database.execute({
    sql: CAPABILITY_CARD_SELECT,
    args: [JSON.stringify(repoIds)],
  });

  const cards: CapabilityCard[] = [];
  const statements: InStatement[] = [];

  for (const row of metaResult.rows) {
    const meta = rowToMetadata(row);
    const local = buildCapabilityCard(meta);
    const card = knowledgePipelineEnabled() ? await knowledgeCapabilityCard(local) : local;
    cards.push(card);

    const existing = await dependencies.database.execute({
      sql: 'SELECT source_fingerprint FROM repo_capability_cards WHERE repo_id = ?',
      args: [card.repoId],
    });
    const storedFingerprint = existing.rows[0]?.source_fingerprint;
    if (storedFingerprint === card.sourceFingerprint) continue;

    statements.push({
      sql: `INSERT INTO repo_capability_cards
              (repo_id, source_fingerprint, purpose, capabilities, language, tools,
               adoption_type, maintenance, embedding_refs, provenance, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(repo_id) DO UPDATE SET
              source_fingerprint = excluded.source_fingerprint,
              purpose = excluded.purpose,
              capabilities = excluded.capabilities,
              language = excluded.language,
              tools = excluded.tools,
              adoption_type = excluded.adoption_type,
              maintenance = excluded.maintenance,
              embedding_refs = excluded.embedding_refs,
              provenance = excluded.provenance,
              updated_at = datetime('now')`,
      args: [
        card.repoId,
        card.sourceFingerprint,
        card.purpose,
        JSON.stringify(card.capabilities),
        card.language,
        JSON.stringify(card.tools),
        card.adoptionType,
        JSON.stringify(card.maintenance),
        JSON.stringify(card.embeddingRefs),
        JSON.stringify(card.provenance),
      ],
    });
  }

  if (statements.length > 0) {
    await dependencies.database.batch(statements);
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Project fingerprinting (Stage 2)
// ---------------------------------------------------------------------------

export async function computeProjectFingerprint(
  project: ProjectRecommendationRepo,
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<ProjectFingerprint> {
  const evidence: string[] = [
    `knowledge-pipeline:${knowledgePipelineEnabled() ? KNOWLEDGE_RETRIEVAL_VERSION : RETRIEVAL_VERSION}`,
    `source:${project.sourceContext?.revision || ''}:${project.sourceContext?.scope || ''}`,
    JSON.stringify(project.sourceContext?.documents || []),
    project.sourceContext?.readme || '',
    `repo:${project.fullName}`,
    `desc:${project.description ?? ''}`,
    `lang:${project.language ?? ''}`,
    `topics:${JSON.stringify([...project.topics].sort())}`,
    `tools:${JSON.stringify(project.tools.map((t) => t.key).sort())}`,
    `ai:${project.aiSummary ?? ''}|${project.aiCategory ?? ''}|${JSON.stringify(project.aiKeywords ?? [])}`,
  ];
  const fingerprint = fingerprintTexts(evidence);

  await dependencies.database.execute({
    sql: `INSERT INTO project_fingerprints (repo_id, fingerprint, evidence, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(repo_id) DO UPDATE SET
            fingerprint = excluded.fingerprint,
            evidence = excluded.evidence,
            updated_at = datetime('now')`,
    args: [project.id, fingerprint, JSON.stringify(evidence)],
  });

  return { repoId: project.id, fingerprint, evidence };
}

async function loadStoredFingerprint(
  repoId: number,
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<string | null> {
  const result = await dependencies.database.execute({
    sql: 'SELECT fingerprint FROM project_fingerprints WHERE repo_id = ?',
    args: [repoId],
  });
  const fp = result.rows[0]?.fingerprint;
  return typeof fp === 'string' ? fp : null;
}

// ---------------------------------------------------------------------------
// Need extraction (Stage 3)
// ---------------------------------------------------------------------------

function requirementDocuments(project: ProjectRecommendationRepo) {
  const context = project.sourceContext;
  if (!context) return [{ path: 'description', text: project.description ?? '' }];
  const documents = context.documents?.length
    ? context.documents.filter(
        (document) =>
          /(?:^|\/)(?:PRODUCT|PROJECT_STATUS|README)(?:\.(?:md|markdown|rst|txt))?$/i.test(
            document.path
          ) || /(?:^|\/)docs\/product\/.*\.md$/i.test(document.path)
      )
    : context.readme
      ? [{ path: 'README.md', text: context.readme }]
      : [];
  const contract = documents.find((document) => /(?:^|\/)PRODUCT\.md$/i.test(document.path));
  return contract ? [contract] : documents;
}

function explicitRequirements(text: string): Array<{ statement: string; quote: string }> {
  const requirements: Array<{ statement: string; quote: string }> = [];
  let fence = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const delimiter = line.match(/^(`{3,}|~{3,})/);
    if (delimiter) {
      if (!fence) fence = delimiter[1];
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = '';
      continue;
    }
    if (fence || /^>|^[-*]\s+\[[xX]\]/.test(line)) continue;
    const unchecked = line.match(/^[-*]\s+\[ \]\s+(.+)$/);
    const statement = unchecked?.[1] ?? line.replace(/^[-*]\s+/, '');
    if (
      !unchecked &&
      !/^(?:TODO\s*:|missing\b|lacks?\b|cannot\b|not yet\b|needs? to\b)/i.test(statement)
    )
      continue;
    if (
      statement.length < 12 ||
      statement.length > 240 ||
      /^(?:do not|never|keep|preserve|must not|no need|not required)\b/i.test(statement)
    )
      continue;
    requirements.push({ statement, quote: line });
  }
  return requirements;
}

export function extractNeeds(project: ProjectRecommendationRepo): ProjectNeed[] {
  const needs: ProjectNeed[] = [];
  const seen = new Set<string>();
  for (const document of requirementDocuments(project)) {
    for (const { statement, quote } of explicitRequirements(document.text)) {
      const need: ProjectNeed = {
        id: `${project.id}-${fingerprintTexts([document.path, statement]).slice(0, 16)}`,
        title: statement,
        currentState: statement,
        desiredOutcome: statement,
        priority: 'medium',
        constraints: [],
        evidence: [`${document.path}: ${quote}`],
        searchIntents: [statement],
        signature: '',
      };
      need.signature = needSignature(need);
      if (seen.has(need.signature)) continue;
      seen.add(need.signature);
      needs.push(need);
      if (needs.length === MAX_NEEDS) return needs;
    }
  }
  return needs;
}

/**
 * Merge overlapping needs by signature. Retains the higher-priority need.
 */
export function mergeNeeds(needs: ProjectNeed[]): ProjectNeed[] {
  const bySignature = new Map<string, ProjectNeed>();
  const priorityWeight: Record<NeedPriority, number> = { high: 3, medium: 2, low: 1 };

  for (const need of needs) {
    const existing = bySignature.get(need.signature);
    if (!existing || priorityWeight[need.priority] > priorityWeight[existing.priority]) {
      bySignature.set(need.signature, need);
    }
  }

  return Array.from(bySignature.values()).sort(
    (a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]
  );
}

/**
 * Reject needs with insufficient evidence. A need must have at least
 * MIN_NEED_EVIDENCE evidence entries to be retained.
 */
export function rejectUnsupportedNeeds(needs: ProjectNeed[]): {
  retained: ProjectNeed[];
  rejected: ProjectNeed[];
} {
  const retained: ProjectNeed[] = [];
  const rejected: ProjectNeed[] = [];
  for (const need of needs) {
    if (need.evidence.length >= MIN_NEED_EVIDENCE) {
      retained.push(need);
    } else {
      rejected.push(need);
    }
  }
  return { retained, rejected };
}

// ---------------------------------------------------------------------------
// Per-need retrieval (Stage 4)
// ---------------------------------------------------------------------------

function projectText(project: ProjectRecommendationRepo): string {
  return buildRepoEmbeddingText({
    full_name: project.fullName,
    description: project.description,
    language: project.language,
    topics: project.topics,
    ai: {
      summary: project.aiSummary,
      category: project.aiCategory,
      keywords: project.aiKeywords,
    },
  });
}

async function semanticCandidatesForNeed(
  need: ProjectNeed,
  embed: (texts: string[]) => Promise<number[][]>,
  vectorStore: VectorStore
): Promise<number[]> {
  const queryText = need.searchIntents.join(' ');
  const [embedding] = await embed([queryText]);
  if (!embedding) return [];
  const matches = await vectorStore.query(embedding, VECTOR_TOP_K);
  return matches.filter((m) => m.distance <= VECTOR_DISTANCE_MAX).map((m) => m.repoId);
}

async function lexicalCandidatesForNeed(
  need: ProjectNeed,
  database: NeedDrivenIntelligenceDependencies['database']
): Promise<number[]> {
  const query = ftsSearchQuery(need.searchIntents.join(' '));
  if (!query) return [];
  try {
    const result = await database.execute({
      sql: `SELECT r.id, MIN(matches.rank) AS best_rank
            FROM (
              SELECT repos_fts.rowid AS id,
                     bm25(repos_fts, 10.0, 14.0, 3.0, 1.5, 2.5) AS rank
              FROM repos_fts
              WHERE repos_fts MATCH ?
              UNION ALL
              SELECT repo_ai_metadata_fts.rowid AS id,
                     bm25(repo_ai_metadata_fts, 4.0, 3.0, 2.0, 2.0, 2.5) AS rank
              FROM repo_ai_metadata_fts
              WHERE repo_ai_metadata_fts MATCH ?
            ) matches
            JOIN repos r ON r.id = matches.id
            WHERE r.archived = 0 AND ${ELIGIBLE_REPO_SQL}
            GROUP BY r.id
            ORDER BY best_rank ASC, r.stargazers_count DESC
            LIMIT ?`,
      args: [query, query, MIN_STARS_FLOOR, LEXICAL_LIMIT],
    });
    return result.rows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
  } catch {
    return [];
  }
}

async function structuredCandidatesForNeed(
  _need: ProjectNeed,
  project: ProjectRecommendationRepo,
  database: NeedDrivenIntelligenceDependencies['database']
): Promise<number[]> {
  if (!project.language) return [];
  try {
    const result = await database.execute({
      sql: `SELECT r.id
            FROM repos r
            WHERE r.archived = 0
              AND r.language = ? COLLATE NOCASE
              AND ${ELIGIBLE_REPO_SQL}
            ORDER BY r.stargazers_count DESC, r.full_name ASC
            LIMIT ?`,
      args: [project.language, MIN_STARS_FLOOR, STRUCTURED_LIMIT],
    });
    return result.rows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
  } catch {
    return [];
  }
}

async function hydrateCandidates(
  ids: number[],
  projectId: number,
  database: NeedDrivenIntelligenceDependencies['database']
): Promise<ProjectRecommendationRepo[]> {
  if (ids.length === 0) return [];
  const result = await database.execute({
    sql: `SELECT r.id,
                 r.name,
                 r.full_name,
                 r.html_url,
                 r.description,
                 r.language,
                 r.stargazers_count,
                 r.archived,
                 r.topics,
                 aim.summary AS ai_summary,
                 aim.category AS ai_category,
                 aim.keywords AS ai_keywords,
                 COALESCE((
                   SELECT json_group_array(json_object(
                     'key', rt.tool_key,
                     'name', rt.tool_name,
                     'category', rt.category,
                     'confidence', rt.confidence
                   ))
                   FROM repo_tools rt WHERE rt.repo_id = r.id
                 ), '[]') AS tools
          FROM repos r
          LEFT JOIN repo_ai_metadata aim ON aim.repo_id = r.id
          WHERE r.id != ?
            AND r.archived = 0
            AND ${knowledgePipelineEnabled() ? '1 = 1' : ELIGIBLE_REPO_SQL}
            AND r.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`,
    args: knowledgePipelineEnabled()
      ? [projectId, JSON.stringify(ids)]
      : [projectId, MIN_STARS_FLOOR, JSON.stringify(ids)],
  });
  const byId = new Map<number, ProjectRecommendationRepo>();
  for (const row of result.rows) {
    const repo: ProjectRecommendationRepo = {
      id: Number(row.id),
      name: String(row.name),
      fullName: String(row.full_name),
      htmlUrl: String(row.html_url),
      description: typeof row.description === 'string' ? row.description : null,
      language: typeof row.language === 'string' ? row.language : null,
      stargazersCount: Number(row.stargazers_count ?? 0),
      archived: Boolean(row.archived),
      topics: parseStringArray(row.topics),
      aiSummary: typeof row.ai_summary === 'string' ? row.ai_summary : null,
      aiCategory: typeof row.ai_category === 'string' ? row.ai_category : null,
      aiKeywords: parseStringArray(row.ai_keywords),
      tools: parseToolSignals(row.tools),
    };
    byId.set(repo.id, repo);
  }
  return ids.flatMap((id) => {
    const repo = byId.get(id);
    return repo ? [repo] : [];
  });
}

// ---------------------------------------------------------------------------
// Classification (Stage 5)
// ---------------------------------------------------------------------------

function classifyCandidate(
  project: ProjectRecommendationRepo,
  need: ProjectNeed,
  candidate: ProjectRecommendationRepo
): {
  classification: CandidateClassification;
  confidence: Confidence;
  evidence: string[];
  score: number;
} {
  const evidence: string[] = [];
  let score = 0;

  // Language match
  if (
    project.language &&
    candidate.language &&
    project.language.toLowerCase() === candidate.language.toLowerCase()
  ) {
    score += 6;
    evidence.push(`Same primary language: ${project.language}`);
  }

  // Topic overlap
  const projectTopics = new Set(project.topics.map((t) => t.toLowerCase()));
  const candidateTopics = new Set(candidate.topics.map((t) => t.toLowerCase()));
  const topicMatches = [...projectTopics].filter((t) => candidateTopics.has(t)).slice(0, 3);
  if (topicMatches.length > 0) {
    score += topicMatches.length * 10;
    evidence.push(`Shared topics: ${topicMatches.join(', ')}`);
  }

  // Tool overlap
  const projectToolKeys = new Set(project.tools.map((t) => t.key.toLowerCase()));
  const candidateToolKeys = new Set(candidate.tools.map((t) => t.key.toLowerCase()));
  const toolMatches = [...projectToolKeys].filter((t) => candidateToolKeys.has(t)).slice(0, 3);
  if (toolMatches.length > 0) {
    score += toolMatches.length * 12;
    const names = toolMatches.map(
      (key) => candidate.tools.find((t) => t.key.toLowerCase() === key)?.name ?? key
    );
    evidence.push(`Shared tools: ${names.join(', ')}`);
  }

  // Need keyword overlap
  const needText = `${need.title} ${need.searchIntents.join(' ')}`.toLowerCase();
  const candidateText =
    `${candidate.fullName} ${candidate.description ?? ''} ${candidate.topics.join(' ')}`.toLowerCase();
  const needWords: string[] = needText.match(/[a-z0-9+#.-]{3,}/g) ?? [];
  const overlap = needWords.filter((w) => candidateText.includes(w) && w.length > 3);
  if (overlap.length > 0) {
    score += Math.min(overlap.length, 5) * 4;
    evidence.push(`Need keyword overlap: ${[...new Set(overlap)].slice(0, 5).join(', ')}`);
  }

  // Maintenance signals
  if (candidate.archived) {
    score -= 20;
    evidence.push('Repository is archived');
  }
  if (candidate.stargazersCount >= 50_000) {
    score += 4;
    evidence.push(`High adoption: ${candidate.stargazersCount} stars`);
  }

  const classification: CandidateClassification = candidate.archived
    ? 'unsuitable_negative_example'
    : 'reference_implementation';
  const confidence: Confidence = candidate.archived ? 'high' : 'low';
  if (!candidate.archived)
    evidence.push('Unreviewed retrieval match; integration suitability is unverified');

  return { classification, confidence, evidence, score };
}

function retrievalMode(
  semantic: number,
  lexical: number,
  structured: number,
  fallback: boolean
): ProjectRetrievalMode {
  if (fallback) return 'fallback';
  if (semantic > 0 && (lexical > 0 || structured > 0)) return 'hybrid';
  if (semantic > 0) return 'semantic';
  if (lexical > 0) return 'lexical-structured';
  return 'structured';
}

// ---------------------------------------------------------------------------
// Candidate pool caching
// ---------------------------------------------------------------------------

async function loadCachedCandidatePool(
  need: ProjectNeed,
  constraintsHash: string,
  catalogGeneration: string,
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<number[] | null> {
  const result = await dependencies.database.execute({
    sql: `SELECT candidate_ids FROM need_candidate_pools
          WHERE signature = ? AND retrieval_version = ? AND catalog_generation = ? AND constraints_hash = ?`,
    args: [need.signature, RETRIEVAL_VERSION, catalogGeneration, constraintsHash],
  });
  const ids = result.rows[0]?.candidate_ids;
  if (typeof ids !== 'string') return null;
  try {
    const parsed = JSON.parse(ids) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is number => typeof v === 'number' && Number.isSafeInteger(v))
      : null;
  } catch {
    return null;
  }
}

async function storeCandidatePool(
  need: ProjectNeed,
  constraintsHash: string,
  catalogGeneration: string,
  candidateIds: number[],
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<void> {
  await dependencies.database.execute({
    sql: `INSERT INTO need_candidate_pools
            (signature, retrieval_version, catalog_generation, constraints_hash, candidate_ids, candidate_count)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(signature, retrieval_version, catalog_generation, constraints_hash)
          DO UPDATE SET candidate_ids = excluded.candidate_ids, candidate_count = excluded.candidate_count`,
    args: [
      need.signature,
      RETRIEVAL_VERSION,
      catalogGeneration,
      constraintsHash,
      JSON.stringify(candidateIds),
      candidateIds.length,
    ],
  });
}

function constraintsHash(project: ProjectRecommendationRepo): string {
  return fingerprintTexts([
    project.language ?? '',
    JSON.stringify(project.topics.sort()),
    JSON.stringify(project.tools.map((t) => t.key).sort()),
  ]);
}

// ---------------------------------------------------------------------------
// Draft report persistence (Stage 6)
// ---------------------------------------------------------------------------

async function markPreviousLatestDraft(
  repoId: number,
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<void> {
  await dependencies.database.execute({
    sql: 'UPDATE project_draft_reports SET is_latest = 0 WHERE repo_id = ? AND is_latest = 1',
    args: [repoId],
  });
}

async function persistDraftReport(
  report: DraftReport,
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<number> {
  if (knowledgePipelineEnabled())
    await ingestKnowledgeDocuments([
      {
        external_id: `project:${report.repoId}:draft:${report.fingerprint}`,
        content: JSON.stringify(report),
        metadata: {
          kind: 'project_report',
          repo_id: report.repoId,
          visibility: 'public',
          validation: 'model_evidence_checked',
          human_validated: false,
        },
      },
    ]);
  await markPreviousLatestDraft(report.repoId, dependencies);
  const result = await dependencies.database.execute({
    sql: `INSERT INTO project_draft_reports
            (repo_id, fingerprint, catalog_generation, retrieval_version, status,
             report, needs_count, candidates_count, provenance, is_latest)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    args: [
      report.repoId,
      report.fingerprint,
      report.catalogGeneration,
      report.retrievalVersion,
      report.status,
      JSON.stringify(report),
      report.needsCount,
      report.candidatesCount,
      JSON.stringify(report.provenance),
    ],
  });
  return result.lastInsertRowid ?? 0;
}

export async function loadLatestDraftReport(
  repoId: number,
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<DraftReport | null> {
  const result = await dependencies.database.execute({
    sql: `SELECT report FROM project_draft_reports
          WHERE repo_id = ? AND is_latest = 1 AND retrieval_version = ?
          ORDER BY created_at DESC LIMIT 1`,
    args: [repoId, knowledgePipelineEnabled() ? KNOWLEDGE_RETRIEVAL_VERSION : RETRIEVAL_VERSION],
  });
  const raw = result.rows[0]?.report;
  if (typeof raw !== 'string') return null;
  try {
    const report = JSON.parse(raw) as DraftReport;
    return report.retrievalVersion ===
      (knowledgePipelineEnabled() ? KNOWLEDGE_RETRIEVAL_VERSION : RETRIEVAL_VERSION)
      ? report
      : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// External review contract (Stage 7 — ingestion only)
// ---------------------------------------------------------------------------

export function reviewRequestHash(report: DraftReport): string {
  return fingerprintTexts([
    report.repoId.toString(),
    report.fingerprint,
    report.catalogGeneration,
    JSON.stringify(
      report.needs.map((n) => ({
        id: n.need.id,
        candidates: n.candidates.map((c) => c.repoId),
      }))
    ),
  ]);
}

export function reviewIdempotencyKey(repoId: number, requestHash: string): string {
  return fingerprintTexts([repoId.toString(), requestHash]);
}

export async function createExternalReviewRequest(
  repoId: number,
  draftReportId: number,
  report: DraftReport,
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<{ request: ExternalReviewRequest; created: boolean }> {
  const requestHash = reviewRequestHash(report);
  const idempotencyKey = reviewIdempotencyKey(repoId, requestHash);

  const existing = await dependencies.database.execute({
    sql: 'SELECT id, status FROM external_review_requests WHERE idempotency_key = ?',
    args: [idempotencyKey],
  });
  if (existing.rows.length > 0) {
    return {
      request: {
        idempotencyKey,
        repoId,
        draftReportId,
        requestHash,
        status: existing.rows[0].status as ReviewStatus,
      },
      created: false,
    };
  }

  await dependencies.database.execute({
    sql: `INSERT INTO external_review_requests
            (idempotency_key, repo_id, draft_report_id, request_hash, status)
          VALUES (?, ?, ?, ?, 'pending')`,
    args: [idempotencyKey, repoId, draftReportId, requestHash],
  });

  return {
    request: { idempotencyKey, repoId, draftReportId, requestHash, status: 'pending' },
    created: true,
  };
}

export interface ReviewIngestionResult {
  reviewedReportId: number;
  created: boolean;
}

/**
 * Ingest an external review result. Idempotent — duplicate submissions with
 * the same idempotency key return the existing reviewed report.
 */
export async function ingestExternalReview(
  result: ExternalReviewResult,
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<ReviewIngestionResult> {
  // Check for existing submission
  const existing = await dependencies.database.execute({
    sql: `SELECT id, status FROM external_review_requests WHERE idempotency_key = ?`,
    args: [result.idempotencyKey],
  });
  if (existing.rows.length === 0) {
    throw new Error('No matching external review request for idempotency key');
  }

  const requestId = Number(existing.rows[0].id);
  const existingStatus = existing.rows[0].status;
  if (existingStatus === 'complete') {
    // Idempotent — return existing reviewed report
    const reviewed = await dependencies.database.execute({
      sql: `SELECT id FROM project_reviewed_reports WHERE review_request_id = ? ORDER BY created_at DESC LIMIT 1`,
      args: [requestId],
    });
    const reviewedId = Number(reviewed.rows[0]?.id ?? 0);
    return { reviewedReportId: reviewedId, created: false };
  }

  // Load the draft report
  const requestRow = await dependencies.database.execute({
    sql: 'SELECT repo_id, draft_report_id FROM external_review_requests WHERE id = ?',
    args: [requestId],
  });
  const repoId = Number(requestRow.rows[0]?.repo_id);
  const draftReportId = Number(requestRow.rows[0]?.draft_report_id);

  const draftResult = await dependencies.database.execute({
    sql: 'SELECT report FROM project_draft_reports WHERE id = ?',
    args: [draftReportId],
  });
  const draftRaw = draftResult.rows[0]?.report;
  if (typeof draftRaw !== 'string') {
    throw new Error('Draft report not found for external review ingestion');
  }
  const draft = JSON.parse(draftRaw) as DraftReport;

  // Apply verdicts to the draft
  const appliedReport = applyReviewVerdicts(draft, result.verdicts);

  if (knowledgePipelineEnabled())
    await ingestKnowledgeDocuments([
      {
        external_id: `project:${repoId}:review:${result.idempotencyKey}`,
        content: JSON.stringify({ report: appliedReport, review: result }),
        metadata: {
          kind: 'project_reviewed_report',
          repo_id: repoId,
          visibility: 'public',
          validation: 'external_review',
          human_validated: false,
        },
      },
    ]);

  // Mark previous reviewed reports as non-latest
  await dependencies.database.execute({
    sql: 'UPDATE project_reviewed_reports SET is_latest = 0 WHERE repo_id = ? AND is_latest = 1',
    args: [repoId],
  });

  // Persist the reviewed report
  const insertResult = await dependencies.database.execute({
    sql: `INSERT INTO project_reviewed_reports
            (repo_id, draft_report_id, review_request_id, status, report,
             reviewer_provider, reviewer_model, reviewer_usage, provenance, is_latest)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    args: [
      repoId,
      draftReportId,
      requestId,
      'complete',
      JSON.stringify(appliedReport),
      result.reviewerProvider,
      result.reviewerModel,
      JSON.stringify(result.reviewerUsage),
      JSON.stringify(
        ['external-review', result.reviewerProvider, result.reviewerModel].filter(Boolean)
      ),
    ],
  });

  // Update the review request status
  await dependencies.database.execute({
    sql: `UPDATE external_review_requests
          SET status = 'complete', result = ?, reviewer_provider = ?, reviewer_model = ?,
              reviewer_usage = ?, completed_at = datetime('now')
          WHERE id = ?`,
    args: [
      JSON.stringify(result),
      result.reviewerProvider,
      result.reviewerModel,
      JSON.stringify(result.reviewerUsage),
      requestId,
    ],
  });

  return { reviewedReportId: insertResult.lastInsertRowid ?? 0, created: true };
}

function applyReviewVerdicts(draft: DraftReport, verdicts: ReviewVerdict[]): DraftReport {
  const verdictsByNeedId = new Map(verdicts.map((v) => [v.needId, v]));
  const rejectedCandidateIds = new Set<number>();
  for (const v of verdicts) {
    for (const id of v.rejectedCandidateIds ?? []) {
      rejectedCandidateIds.add(id);
    }
  }

  const needs: NeedReport[] = [];
  for (const needReport of draft.needs) {
    const verdict = verdictsByNeedId.get(needReport.need.id);
    if (verdict?.verdict === 'unsupported') {
      // Skip unsupported needs
      continue;
    }
    const filteredCandidates = needReport.candidates.filter(
      (c) => !rejectedCandidateIds.has(c.repoId)
    );
    const refinedNeed = verdict?.refinedNeed
      ? { ...needReport.need, ...verdict.refinedNeed }
      : needReport.need;
    needs.push({ ...needReport, need: refinedNeed, candidates: filteredCandidates });
  }

  return {
    ...draft,
    needs,
    needsCount: needs.length,
    candidatesCount: needs.reduce((sum, n) => sum + n.candidates.length, 0),
  };
}

export async function loadLatestReviewedReport(
  repoId: number,
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<ReviewedReport | null> {
  const result = await dependencies.database.execute({
    sql: `SELECT id, draft_report_id, review_request_id, status, report,
                 reviewer_provider, reviewer_model, reviewer_usage, provenance, created_at
          FROM project_reviewed_reports
          WHERE repo_id = ? AND is_latest = 1
          ORDER BY created_at DESC LIMIT 1`,
    args: [repoId],
  });
  const row = result.rows[0];
  if (!row) return null;
  try {
    const report = JSON.parse(String(row.report)) as DraftReport;
    if (
      report.retrievalVersion !==
      (knowledgePipelineEnabled() ? KNOWLEDGE_RETRIEVAL_VERSION : RETRIEVAL_VERSION)
    ) {
      return null;
    }
    return {
      repoId,
      draftReportId: Number(row.draft_report_id),
      reviewRequestId: row.review_request_id ? Number(row.review_request_id) : null,
      status: row.status as ReviewedReportStatus,
      report,
      reviewerProvider: typeof row.reviewer_provider === 'string' ? row.reviewer_provider : null,
      reviewerModel: typeof row.reviewer_model === 'string' ? row.reviewer_model : null,
      reviewerUsage: parseUsage(row.reviewer_usage),
      provenance: parseStringArray(row.provenance),
      createdAt: String(row.created_at),
    };
  } catch {
    return null;
  }
}

function parseUsage(value: unknown): Record<string, number> {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, Number(v) ?? 0])
      ) as Record<string, number>;
    }
  } catch {
    // fall through
  }
  return {};
}

// ---------------------------------------------------------------------------
// Pipeline orchestration
// ---------------------------------------------------------------------------

export interface NeedDrivenPipelineOptions {
  catalogGeneration?: string;
  candidatesPerNeed?: number;
  maxTotalCandidates?: number;
}

const defaultDependencies: NeedDrivenIntelligenceDependencies = {
  database: undefined as never, // Set by createNeedDrivenIntelligence
  vectorStore: repoVectors,
  embed: generateEmbeddings,
};

async function resolveNeeds(
  project: ProjectRecommendationRepo,
  fingerprint: string,
  storedFingerprint: string | null,
  deps: NeedDrivenIntelligenceDependencies
): Promise<ProjectNeed[]> {
  let needs = extractNeeds(project);
  const merged = mergeNeeds(needs);
  const { retained } = rejectUnsupportedNeeds(merged);
  needs = retained;

  if (storedFingerprint !== fingerprint) {
    await persistNeeds(project.id, fingerprint, needs, deps);
    return needs;
  }

  const cachedNeeds = await deps.database.execute({
    sql: 'SELECT need_id, title, current_state, desired_outcome, priority, constraints, evidence, search_intents, signature FROM project_needs WHERE repo_id = ? AND fingerprint = ?',
    args: [project.id, fingerprint],
  });
  if (cachedNeeds.rows.length > 0) {
    return cachedNeeds.rows.map((row) => ({
      id: String(row.need_id),
      title: String(row.title),
      currentState: String(row.current_state),
      desiredOutcome: String(row.desired_outcome),
      priority: row.priority as NeedPriority,
      constraints: parseStringArray(row.constraints),
      evidence: parseStringArray(row.evidence),
      searchIntents: parseStringArray(row.search_intents),
      signature: String(row.signature),
    }));
  }
  await persistNeeds(project.id, fingerprint, needs, deps);
  return needs;
}

interface CandidateRetrievalResult {
  candidateIds: number[];
  mode: ProjectRetrievalMode;
  cached: boolean;
  degradation: boolean;
}

interface RetrieveCandidatesParams {
  need: ProjectNeed;
  project: ProjectRecommendationRepo;
  projectConstraintsHash: string;
  catalogGeneration: string;
  deps: NeedDrivenIntelligenceDependencies;
}

async function retrieveCandidatesForNeed(
  params: RetrieveCandidatesParams
): Promise<CandidateRetrievalResult> {
  const { need, project, projectConstraintsHash, catalogGeneration, deps } = params;
  if (knowledgePipelineEnabled()) {
    try {
      const matches = await queryKnowledgeCatalog(
        `${need.title} ${need.desiredOutcome} ${need.searchIntents.join(' ')}`
      );
      return {
        candidateIds: matches.map((match) => match.repoId).filter((id) => id !== project.id),
        mode: 'hybrid',
        cached: false,
        degradation: false,
      };
    } catch {
      return { candidateIds: [], mode: 'fallback', cached: false, degradation: true };
    }
  }
  const cached = await loadCachedCandidatePool(
    need,
    projectConstraintsHash,
    catalogGeneration,
    deps
  );
  if (cached) {
    return { candidateIds: cached, mode: 'hybrid', cached: true, degradation: false };
  }

  const [semanticResult, lexicalResult, structuredResult] = await Promise.allSettled([
    semanticCandidatesForNeed(need, deps.embed, deps.vectorStore()),
    lexicalCandidatesForNeed(need, deps.database),
    structuredCandidatesForNeed(need, project, deps.database),
  ]);
  const semanticIds = semanticResult.status === 'fulfilled' ? semanticResult.value : [];
  const lexicalIds = lexicalResult.status === 'fulfilled' ? lexicalResult.value : [];
  const structuredIds = structuredResult.status === 'fulfilled' ? structuredResult.value : [];

  const degradation = semanticResult.status === 'rejected' || lexicalResult.status === 'rejected';

  const fused = rrfFuse([semanticIds, lexicalIds, structuredIds]).slice(0, HYDRATION_LIMIT);
  const mode = retrievalMode(
    semanticIds.length,
    lexicalIds.length,
    structuredIds.length,
    fused.length === 0
  );

  if (fused.length > 0) {
    await storeCandidatePool(need, projectConstraintsHash, catalogGeneration, fused, deps);
  }

  return { candidateIds: fused, mode, cached: false, degradation };
}

interface ClassifyAndRankParams {
  project: ProjectRecommendationRepo;
  need: ProjectNeed;
  candidateIds: number[];
  deps: NeedDrivenIntelligenceDependencies;
  candidatesPerNeed: number;
}

async function classifyAndRank(params: ClassifyAndRankParams): Promise<NeedCandidate[]> {
  const { project, need, candidateIds, deps, candidatesPerNeed } = params;
  const candidates = await hydrateCandidates(candidateIds, project.id, deps.database);
  if (knowledgePipelineEnabled()) {
    const review = await reviewKnowledgeProject(project, candidates.slice(0, 20), need);
    if (review.status !== 'reviewed') throw new Error('Knowledgebase decision review unavailable');
    const matches = new Map(review.matches.map((match) => [match.repoId, match]));
    const ordered = review.matches.flatMap(
      (match) => candidates.find((candidate) => candidate.id === match.repoId) || []
    );
    return ordered
      .flatMap((repo) => {
        const match = matches.get(repo.id);
        return match
          ? [
              {
                repoId: repo.id,
                fullName: repo.fullName,
                htmlUrl: repo.htmlUrl,
                description: repo.description,
                language: repo.language,
                stargazersCount: repo.stargazersCount,
                archived: repo.archived,
                topics: repo.topics,
                tools: repo.tools,
                classification:
                  match.role === 'integration'
                    ? ('adopt_or_integrate' as const)
                    : ('reference_implementation' as const),
                confidence: 'medium' as const,
                evidence: [match.projectEvidence, match.candidateEvidence],
                score: 1,
              },
            ]
          : [];
      })
      .slice(0, candidatesPerNeed);
  }
  return candidates
    .map((repo) => {
      const result = classifyCandidate(project, need, repo);
      return {
        repoId: repo.id,
        fullName: repo.fullName,
        htmlUrl: repo.htmlUrl,
        description: repo.description,
        language: repo.language,
        stargazersCount: repo.stargazersCount,
        archived: repo.archived,
        topics: repo.topics,
        tools: repo.tools,
        classification: result.classification,
        confidence: result.confidence,
        evidence: result.evidence,
        score: result.score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, candidatesPerNeed);
}

async function refreshReportCapabilities(
  ids: number[],
  dependencies: NeedDrivenIntelligenceDependencies,
  provenance: string[]
): Promise<boolean> {
  if (!ids.length) return false;
  try {
    await refreshCapabilityCards(ids, dependencies);
    provenance.push('capability-cards:refreshed');
    return false;
  } catch {
    provenance.push('capability-cards:skipped');
    return true;
  }
}

export function createNeedDrivenIntelligence(dependencies: NeedDrivenIntelligenceDependencies) {
  return async function runNeedDrivenIntelligence(
    project: ProjectRecommendationRepo,
    options: NeedDrivenPipelineOptions = {}
  ): Promise<DraftReport> {
    const catalogGeneration = options.catalogGeneration ?? new Date().toISOString().slice(0, 10);
    const candidatesPerNeed = options.candidatesPerNeed ?? CANDIDATES_PER_NEED;
    const maxTotalCandidates = options.maxTotalCandidates ?? MAX_TOTAL_CANDIDATES;
    const projectConstraintsHash = constraintsHash(project);

    // Stage 2: Fingerprint
    const fingerprint = await computeProjectFingerprint(project, dependencies);
    const storedFingerprint = await loadStoredFingerprint(project.id, dependencies);

    // Stage 3: Need extraction (with caching)
    const needs = await resolveNeeds(
      project,
      fingerprint.fingerprint,
      storedFingerprint,
      dependencies
    );

    // Stage 4+5: Per-need retrieval and classification
    const needReports: NeedReport[] = [];
    let totalCandidates = 0;
    const allCandidateIds = new Set<number>();
    const provenance: string[] = [
      `fingerprint:${fingerprint.fingerprint.slice(0, 16)}`,
      `catalog:${catalogGeneration}`,
      `retrieval:${RETRIEVAL_VERSION}`,
    ];
    let hasDegradation = false;

    for (const need of needs) {
      if (totalCandidates >= maxTotalCandidates) break;

      const retrieval = await retrieveCandidatesForNeed({
        need,
        project,
        projectConstraintsHash,
        catalogGeneration,
        deps: dependencies,
      });
      if (retrieval.cached) provenance.push(`cached-pool:${need.id}`);
      if (retrieval.degradation) hasDegradation = true;

      const classified = await classifyAndRank({
        project,
        need,
        candidateIds: retrieval.candidateIds,
        deps: dependencies,
        candidatesPerNeed,
      });

      for (const c of classified) {
        allCandidateIds.add(c.repoId);
      }
      totalCandidates += classified.length;

      needReports.push({ need, candidates: classified, retrievalMode: retrieval.mode });
    }

    if (await refreshReportCapabilities([...allCandidateIds], dependencies, provenance))
      hasDegradation = true;

    const status: ReportStatus = hasDegradation ? 'degraded' : 'complete';
    const report: DraftReport = {
      repoId: project.id,
      fingerprint: fingerprint.fingerprint,
      catalogGeneration,
      retrievalVersion: knowledgePipelineEnabled()
        ? KNOWLEDGE_RETRIEVAL_VERSION
        : RETRIEVAL_VERSION,
      status,
      needs: needReports,
      needsCount: needReports.length,
      candidatesCount: totalCandidates,
      provenance,
      createdAt: new Date().toISOString(),
    };

    // Stage 6: Persist draft report
    await persistDraftReport(report, dependencies);

    return report;
  };
}

async function persistNeeds(
  repoId: number,
  fingerprint: string,
  needs: ProjectNeed[],
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<void> {
  // Delete old needs for this repo
  await dependencies.database.execute({
    sql: 'DELETE FROM project_needs WHERE repo_id = ?',
    args: [repoId],
  });
  if (needs.length === 0) return;
  const statements: InStatement[] = needs.map((need) => ({
    sql: `INSERT INTO project_needs
            (repo_id, need_id, title, current_state, desired_outcome, priority,
             constraints, evidence, search_intents, signature, fingerprint)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      repoId,
      need.id,
      need.title,
      need.currentState,
      need.desiredOutcome,
      need.priority,
      JSON.stringify(need.constraints),
      JSON.stringify(need.evidence),
      JSON.stringify(need.searchIntents),
      need.signature,
      fingerprint,
    ],
  }));
  await dependencies.database.batch(statements);
}

// ---------------------------------------------------------------------------
// Incremental evaluation (Stage 4.3)
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a newly cataloged repository crosses the recommendation
 * threshold for any persisted need signature. Returns the need signatures
 * that should trigger a rerun.
 */
export async function evaluateNewCatalogAdditions(
  newRepoIds: number[],
  dependencies: NeedDrivenIntelligenceDependencies
): Promise<string[]> {
  if (newRepoIds.length === 0) return [];

  // Load all persisted need signatures
  const signatures = await dependencies.database.execute({
    sql: 'SELECT DISTINCT signature FROM project_needs',
    args: [],
  });
  const persistedSignatures = signatures.rows
    .map((row) => row.signature)
    .filter((s): s is string => typeof s === 'string');

  if (persistedSignatures.length === 0) return [];

  // Check if any new repos match existing need signatures via FTS
  const triggered = new Set<string>();
  for (const repoId of newRepoIds) {
    const repoResult = await dependencies.database.execute({
      sql: `SELECT r.full_name, r.description, r.language, r.topics,
                   aim.summary, aim.category, aim.keywords
            FROM repos r
            LEFT JOIN repo_ai_metadata aim ON aim.repo_id = r.id
            WHERE r.id = ?`,
      args: [repoId],
    });
    const row = repoResult.rows[0];
    if (!row) continue;

    const repoText = [
      row.full_name,
      row.description,
      row.language,
      row.topics,
      row.summary,
      row.category,
      row.keywords,
    ]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' ')
      .toLowerCase();

    // For each persisted need, check if the new repo is relevant
    // by looking at the need's search intents stored in project_needs
    const needsWithIntents = await dependencies.database.execute({
      sql: 'SELECT DISTINCT signature, search_intents FROM project_needs',
      args: [],
    });
    for (const needRow of needsWithIntents.rows) {
      const sig = needRow.signature;
      if (typeof sig !== 'string' || triggered.has(sig)) continue;
      const intents = parseStringArray(needRow.search_intents);
      const matches = intents.some((intent) =>
        intent.split(/\s+/).some((word) => word.length > 3 && repoText.includes(word.toLowerCase()))
      );
      if (matches) {
        triggered.add(sig);
      }
    }
  }

  return [...triggered];
}
