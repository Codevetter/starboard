import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

import { getAiBinding, textHash } from './embeddings';

const WORKERS_AI_METADATA_MODEL = '@cf/meta/llama-3.1-8b-instruct';
export const REPO_AI_METADATA_ROUTE = `workers-ai:${WORKERS_AI_METADATA_MODEL}|direct:${process.env.AI_MODEL || 'unconfigured'}`;
export const HEURISTIC_REPO_AI_METADATA_MODEL = 'heuristic-taxonomy-v1';

const MAX_TEXT_LENGTH = 1800;
const REQUEST_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '30000', 10);
const MAX_ATTEMPTS = parseInt(process.env.AI_MAX_ATTEMPTS || '2', 10);
const CATEGORIES = [
  'ai-agents',
  'ai-evals',
  'ai-infra',
  'ai-observability',
  'ai-rag',
  'app-framework',
  'cli-tooling',
  'data',
  'database',
  'devtool',
  'frontend',
  'infra',
  'library',
  'security',
  'testing',
  'unknown',
] as const;

export interface RepoMetadataSource {
  full_name: string;
  description: string | null;
  language: string | null;
  topics: string | string[];
}

export interface RepoAiMetadata {
  summary: string;
  category: string;
  subcategories: string[];
  use_cases: string[];
  keywords: string[];
}

export interface RepoAiMetadataResult {
  metadata: RepoAiMetadata;
  model: string;
}

export function buildRepoAiSourceText(repo: RepoMetadataSource): string {
  const topics = Array.isArray(repo.topics) ? repo.topics : parseJsonStringArray(repo.topics);
  return [
    `name: ${repo.full_name}`,
    repo.description ? `description: ${repo.description}` : null,
    repo.language ? `language: ${repo.language}` : null,
    topics.length ? `topics: ${topics.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TEXT_LENGTH);
}

export function repoAiSourceHash(repo: RepoMetadataSource): string {
  return textHash(buildRepoAiSourceText(repo));
}

export function buildRepoAiMetadataPrompt(repo: RepoMetadataSource): string {
  return `Classify this GitHub repository for a repository discovery product.

Return only compact JSON with exactly these keys:
summary: one sentence, under 120 characters
category: one of ${CATEGORIES.join(', ')}
subcategories: 2-5 short lowercase tags
use_cases: 2-5 short lowercase user intents
keywords: 4-10 search aliases, frameworks, product names, or related terms

Rules:
- Prefer concrete developer search terms over generic words.
- Include common aliases when obvious.
- Do not invent capabilities that are unsupported by the metadata.
- Use "unknown" category if the metadata is too sparse.

Repository:
${buildRepoAiSourceText(repo)}`;
}

export async function generateRepoAiMetadata(
  repo: RepoMetadataSource
): Promise<RepoAiMetadataResult> {
  const binding = await getAiBinding();
  if (binding) {
    const workersAi = createWorkersAI({ binding: binding as Ai });
    const result = await generateText({
      model: workersAi(WORKERS_AI_METADATA_MODEL),
      system: 'You produce strict JSON for software repository classification.',
      prompt: buildRepoAiMetadataPrompt(repo),
      temperature: 0.1,
      maxOutputTokens: 260,
      maxRetries: Math.max(0, MAX_ATTEMPTS - 1),
      timeout: { totalMs: REQUEST_TIMEOUT_MS },
    });
    return {
      metadata: normalizeRepoAiMetadata(parseJsonObject(result.text || '{}')),
      model: WORKERS_AI_METADATA_MODEL,
    };
  }

  const url = process.env.AI_BASE_URL;
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (!url || !key || !model) {
    throw new Error('AI_BASE_URL, AI_API_KEY, and AI_MODEL are required');
  }

  const provider = createOpenAICompatible({
    name: 'starboard-direct',
    baseURL: url.replace(/\/+$/, ''),
    apiKey: key,
  });
  const result = await generateText({
    model: provider.chatModel(model),
    system: 'You produce strict JSON for software repository classification.',
    prompt: buildRepoAiMetadataPrompt(repo),
    temperature: 0.1,
    maxOutputTokens: 260,
    maxRetries: Math.max(0, MAX_ATTEMPTS - 1),
    timeout: { totalMs: REQUEST_TIMEOUT_MS },
  });
  return {
    metadata: normalizeRepoAiMetadata(parseJsonObject(result.text || '{}')),
    model: model,
  };
}

export function inferRepoAiMetadata(repo: RepoMetadataSource): RepoAiMetadata {
  const source = buildRepoAiSourceText(repo).toLowerCase();
  const topics = Array.isArray(repo.topics) ? repo.topics : parseJsonStringArray(repo.topics);
  const topicText = topics.join(' ').toLowerCase();
  const text = `${source} ${topicText}`;
  const category = inferCategory(text);
  const keywords = new Set<string>(topics.map((topic) => topic.toLowerCase()));
  const subcategories = new Set<string>();
  const useCases = new Set<string>();

  for (const rule of TAXONOMY_RULES) {
    if (!rule.pattern.test(text)) continue;
    for (const keyword of rule.keywords) keywords.add(keyword);
    for (const subcategory of rule.subcategories) subcategories.add(subcategory);
    for (const useCase of rule.use_cases) useCases.add(useCase);
  }

  if (repo.language) keywords.add(repo.language.toLowerCase());

  return {
    summary: repo.description?.trim() || `${repo.full_name} repository.`,
    category,
    subcategories: Array.from(subcategories).slice(0, 5),
    use_cases: Array.from(useCases).slice(0, 5),
    keywords: Array.from(keywords).filter(Boolean).slice(0, 10),
  };
}

const TAXONOMY_RULES = [
  {
    pattern:
      /\b(eval|evals|evaluation|benchmark|promptfoo|deepeval|ragas|lm-evaluation-harness|testing)\b/,
    category: 'ai-evals',
    subcategories: ['llm evals', 'testing'],
    use_cases: ['evaluate prompts', 'compare model outputs'],
    keywords: ['evals', 'evaluation', 'benchmark', 'llm testing'],
  },
  {
    pattern: /\b(agent|agents|langchain|langgraph|llamaindex|crewai|autogen|workflow)\b/,
    category: 'ai-agents',
    subcategories: ['agent framework', 'workflow orchestration'],
    use_cases: ['build ai agents', 'orchestrate tools'],
    keywords: ['agents', 'agent framework', 'tool calling'],
  },
  {
    pattern: /\b(rag|retrieval|embedding|vector|semantic search)\b/,
    category: 'ai-rag',
    subcategories: ['retrieval', 'semantic search'],
    use_cases: ['build rag apps', 'search knowledge bases'],
    keywords: ['rag', 'retrieval', 'embeddings', 'semantic search'],
  },
  {
    pattern: /\b(observability|tracing|monitoring|telemetry|langfuse|helicone|phoenix|opik)\b/,
    category: 'ai-observability',
    subcategories: ['observability', 'tracing'],
    use_cases: ['monitor llm apps', 'trace production issues'],
    keywords: ['observability', 'tracing', 'monitoring', 'telemetry'],
  },
  {
    pattern: /\b(react|vue|svelte|next\.?js|frontend|ui|css|tailwind)\b/,
    category: 'frontend',
    subcategories: ['frontend', 'ui'],
    use_cases: ['build user interfaces', 'ship web apps'],
    keywords: ['frontend', 'ui', 'web'],
  },
  {
    pattern: /\b(database|postgres|sqlite|mysql|redis|vector database|db)\b/,
    category: 'database',
    subcategories: ['database', 'storage'],
    use_cases: ['store application data', 'query data'],
    keywords: ['database', 'storage', 'query'],
  },
] as const;

function inferCategory(text: string): string {
  for (const rule of TAXONOMY_RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  if (/\b(cli|terminal|command line)\b/.test(text)) return 'cli-tooling';
  if (/\b(security|auth|vulnerability|scan)\b/.test(text)) return 'security';
  if (/\b(test|testing|mock|assert)\b/.test(text)) return 'testing';
  if (/\b(framework|server|api)\b/.test(text)) return 'app-framework';
  return 'library';
}

export function normalizeRepoAiMetadata(value: unknown): RepoAiMetadata {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    summary: cleanText(input.summary, 180) || 'Repository metadata summary unavailable.',
    category: normalizeCategory(input.category),
    subcategories: cleanList(input.subcategories, 5),
    use_cases: cleanList(input.use_cases, 5),
    keywords: cleanList(input.keywords, 10),
  };
}

function normalizeCategory(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase();
  return CATEGORIES.includes(normalized as (typeof CATEGORIES)[number]) ? normalized : 'unknown';
}

function cleanList(value: unknown, maxItems: number): string[] {
  const values = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of values) {
    if (typeof item !== 'string') continue;
    const cleaned = cleanText(item.toLowerCase(), 48)
      .replace(/[^a-z0-9+#._ -]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return {};
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return {};
    }
  }
}

function parseJsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
