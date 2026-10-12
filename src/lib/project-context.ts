import { parseGitHubProjectInput } from '@/lib/github-projects';
import type { ProjectRecommendationRepo, ProjectToolSignal } from '@/lib/project-recommendations';
import {
  detectToolsFromManifest,
  detectToolsFromRepoSignals,
  mergeToolDetections,
} from '@/lib/repo-tools';

export interface ProjectSourceContext {
  status: 'complete' | 'partial' | 'unavailable';
  revision: string | null;
  readme: string;
  files: string[];
  scope?: string;
  dependencies?: string[];
  documents?: { path: string; text: string; truncated?: boolean }[];
}

export function parseProjectFolder(path: string): string | null {
  const trimmed = path.trim().replace(/\/$/, '');
  if (
    trimmed.length > 180 ||
    !/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/i.test(trimmed) ||
    trimmed.split('/').some((part) => part === '.' || part === '..')
  )
    return null;
  return trimmed;
}

interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

// Inspect source manifests, not lockfile dependency trees, examples or agent instructions.
const MANIFEST =
  /(?:^|\/)(?:package\.json|pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|Package\.swift|Gemfile|composer\.json|pom\.xml|build\.gradle(?:\.kts)?|CMakeLists\.txt)$/i;
const EXCLUDED =
  /(?:^|\/)(?:node_modules|vendor|dist|build|target|coverage|\.next|\.git|\.claude|\.codex|examples?|fixtures?|__tests__|tests?|docs|artifacts|designs?|original|benchmarks?|experiments?)(?:\/|$)/i;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 100_000;
const MAX_PRODUCT_CONTEXT_CHARS = 12_000;
const PRODUCT_DOCUMENT =
  /^(?:PRODUCT\.md|PROJECT_STATUS\.md|README(?:\.md|\.markdown|\.rst|\.txt)?|docs\/product\/(?:overview|features)\.md)$/i;

const OPERATIONAL_SECTION =
  /^(?:install(?:ation)?|setup|getting started|quick start|prerequisites|requirements|development|develop|verify|build(?:ing)?|check the build|deployment|deploy|contributing|license|licence|task reconciliation|historical|timeline)\b/i;

/** Keep product/features prose; install commands and dependency tables drown out purpose. */
export function projectReadmeContext(markdown: string): string {
  let skipLevel = 0;
  const sections: { heading: string; lines: string[] }[] = [{ heading: '', lines: [] }];
  let datedSections = 0;
  for (const line of markdown.replace(/```[\s\S]*?```/g, '').split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      if (skipLevel && heading[1].length <= skipLevel) skipLevel = 0;
      const historicalStatus = /^\d{4}-\d{2}-\d{2}\b/.test(heading[2]) && ++datedSections > 3;
      if (OPERATIONAL_SECTION.test(heading[2]) || historicalStatus) {
        skipLevel = heading[1].length;
      }
      if (!skipLevel) sections.push({ heading: line, lines: [] });
      continue;
    }
    if (!skipLevel) sections.at(-1)!.lines.push(line);
  }
  const cleaned = sections
    .map(({ heading, lines }) => ({
      heading,
      text: lines
        .join('\n')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .trim(),
    }))
    .filter((section) => section.heading || section.text);
  const full = cleaned
    .map(({ heading, text }) => [heading, text].filter(Boolean).join('\n'))
    .join('\n\n');
  if (full.length <= MAX_PRODUCT_CONTEXT_CHARS) return full;

  // Reserve evidence from every section before spending remaining space on
  // long early sections. Keep headings so consumers can distinguish goals,
  // product editions and shipped behavior.
  const headings = cleaned.reduce((sum, section) => sum + section.heading.length + 3, 0);
  const allowance = Math.max(
    0,
    Math.floor((MAX_PRODUCT_CONTEXT_CHARS - headings) / cleaned.length)
  );
  return cleaned
    .map(({ heading, text }) => {
      const excerpt = text.slice(0, allowance);
      const boundary = Math.max(excerpt.lastIndexOf('\n'), excerpt.lastIndexOf('. '));
      return [
        heading,
        text.length <= allowance
          ? text
          : boundary > allowance / 2
            ? excerpt.slice(0, boundary + 1)
            : excerpt,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n')
    .slice(0, MAX_PRODUCT_CONTEXT_CHARS);
}

interface LoadedFile {
  path: string;
  content: string;
}
interface SourceTree {
  sha: string;
  truncated?: boolean;
  tree: TreeEntry[];
}
interface ProjectLocation {
  input?: string;
  scope?: string;
}
type ProjectSlug = NonNullable<ReturnType<typeof parseGitHubProjectInput>>;

function sourceLocation(defaultBranch: string, location: ProjectLocation) {
  let ref = defaultBranch;
  let scope = location.scope ? parseProjectFolder(location.scope) : '';
  if (location.scope && !scope) throw new Error('Invalid project folder');
  if (location.input?.includes('/tree/')) {
    const parts = location.input
      .split('/tree/')[1]
      .split(/[?#]/, 1)[0]
      .replace(/\/$/, '')
      .split('/');
    ref = decodeURIComponent(parts.shift() ?? '');
    if (!ref || !/^[a-z0-9_./-]{1,180}$/i.test(ref)) throw new Error('Invalid project ref');
    scope = parts.length ? parseProjectFolder(parts.join('/')) : '';
    if (parts.length && !scope) throw new Error('Invalid project folder');
  }
  return { ref, scope: scope || '' };
}

function inProject(entry: TreeEntry, scope: string) {
  return (
    entry.type === 'blob' &&
    (!scope || entry.path.startsWith(`${scope}/`)) &&
    (!EXCLUDED.test(entry.path) || PRODUCT_DOCUMENT.test(projectPath(entry.path, scope)))
  );
}

function projectPath(path: string, scope: string) {
  return scope ? path.slice(scope.length + 1) : path;
}

function selectSource(tree: SourceTree, scope: string) {
  const entries = tree.tree.filter((entry) => inProject(entry, scope));
  const available = entries.filter((entry) => (entry.size ?? MAX_FILE_BYTES + 1) <= MAX_FILE_BYTES);
  const readme = available.find((entry) =>
    /^readme(?:\.md|\.markdown|\.rst|\.txt)?$/i.test(
      scope ? entry.path.slice(scope.length + 1) : entry.path
    )
  );
  const manifests = available
    .filter((entry) => MANIFEST.test(entry.path))
    .sort(
      (a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path)
    );
  const documents = available
    .filter((entry) => PRODUCT_DOCUMENT.test(projectPath(entry.path, scope)))
    .sort((a, b) => a.path.localeCompare(b.path));
  const all = [...documents, ...manifests];
  return {
    readme,
    selected: all.slice(0, MAX_FILES),
    partial:
      Boolean(tree.truncated) ||
      all.length > MAX_FILES ||
      entries.some(
        (entry) =>
          (MANIFEST.test(entry.path) || PRODUCT_DOCUMENT.test(projectPath(entry.path, scope))) &&
          (entry.size ?? MAX_FILE_BYTES + 1) > MAX_FILE_BYTES
      ),
  };
}

async function loadPublicFiles(
  fetcher: typeof fetch,
  slug: ProjectSlug,
  revision: string,
  selected: TreeEntry[],
  signal: AbortSignal
) {
  const loaded: LoadedFile[] = [];
  let failed = false;
  // Public raw requests carry no OAuth token, even if visibility changes mid-request.
  for (let offset = 0; offset < selected.length; offset += 4) {
    await Promise.all(
      selected.slice(offset, offset + 4).map(async (entry) => {
        try {
          const path = entry.path.split('/').map(encodeURIComponent).join('/');
          const response = await fetcher(
            `https://raw.githubusercontent.com/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.repo)}/${revision}/${path}`,
            { signal, next: { revalidate: 1800 } }
          );
          if (!response.ok || Number(response.headers.get('content-length')) > MAX_FILE_BYTES) {
            failed = true;
            return;
          }
          const content = await response.text();
          if (content.length > MAX_FILE_BYTES) {
            failed = true;
            return;
          }
          loaded.push({ path: entry.path, content });
        } catch {
          failed = true;
        }
      })
    );
  }
  loaded.sort((a, b) => a.path.localeCompare(b.path));
  return { loaded, failed };
}

function manifestDependencies(loaded: LoadedFile[]) {
  const names = new Set<string>();
  let failed = false;
  for (const file of loaded) {
    if (!file.path.endsWith('package.json')) continue;
    try {
      const manifest = JSON.parse(file.content) as Record<string, Record<string, unknown>>;
      for (const key of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ])
        for (const name of Object.keys(manifest[key] ?? {})) names.add(name);
    } catch {
      failed = true;
    }
  }
  return { names: [...names].sort().slice(0, 200), failed };
}

const IMPLEMENTATION = /\.(?:ts|tsx|js|mjs|go|rs|swift|py)$/i;
interface ImplementationHint {
  entry: TreeEntry;
  matches: string[];
  entryPoint: boolean;
  referenced: boolean;
}

function implementationProse(loaded: LoadedFile[], scope: string) {
  const contract = loaded.find((file) => /(?:^|\/)PRODUCT\.md$/i.test(file.path));
  const baseline = contract?.content.match(
    /\b([A-Z][\w-]+) is the upstream implementation baseline\b/
  )?.[1];
  return loaded
    .filter(
      (file) =>
        PRODUCT_DOCUMENT.test(projectPath(file.path, scope)) &&
        !(baseline && /(?:^|\/)README\b/i.test(file.path) && file.content.includes(baseline))
    )
    .map((file) => projectReadmeContext(file.content))
    .join('\n');
}

const SEPARATE_EDITION = /\b([A-Z][\w-]+) is a separate\b/g;
const NAMED_EDITION = /\bThe ([A-Z][\w-]+) edition\b/g;
const AUXILIARY_SECTION = /\b(?:additional|examples?|exercises?|historical|archived)\b/i;
const OPERATOR_SCRIPT = /(?:^|\/)scripts\//i;
const SUPPORT_FILE =
  /(?:^|\/)(?:config|configuration|.*\.config)\.|(?:[._](?:test|spec)\.[^/]+$|\.d\.[^/]+$)/i;
const SOURCE_REFERENCE =
  /(?:[a-zA-Z0-9_.-]+\/)+[a-zA-Z0-9_.-]+\.(?:ts|tsx|js|mjs|go|rs|swift|py)\b/g;
const SOURCE_WORDS = /[a-z]{4,}/g;

function implementationBoundaries(prose: string, scope: string) {
  const separateNames: string[] = [];
  if (!scope) {
    for (const match of prose.matchAll(SEPARATE_EDITION))
      separateNames.push(match[1].toLowerCase());
    for (const match of prose.matchAll(NAMED_EDITION)) separateNames.push(match[1].toLowerCase());
  }
  const auxiliaryPattern = AUXILIARY_SECTION;
  const supplementary = new Set(
    prose
      .split('\n')
      .filter((line) => auxiliaryPattern.test(line))
      .flatMap((line) =>
        line.split(String.fromCharCode(96)).filter((_part, index) => index % 2 === 1)
      )
      .filter((path) => path.includes('/'))
      .map((path) => path.slice(0, path.lastIndexOf('/') + 1))
      .filter((path) => parseProjectFolder(path.slice(0, -1)))
  );
  return { separateNames, supplementary };
}

function manifestEntryPoints(loaded: LoadedFile[]) {
  const entryPoints = new Set<string>();
  for (const file of loaded.filter((item) => item.path.endsWith('package.json'))) {
    try {
      const manifest = JSON.parse(file.content) as {
        main?: unknown;
        module?: unknown;
        bin?: unknown;
      };
      const bins =
        typeof manifest.bin === 'string'
          ? [manifest.bin]
          : manifest.bin && typeof manifest.bin === 'object'
            ? Object.values(manifest.bin)
            : [];
      const directory = file.path.slice(0, -'package.json'.length);
      for (const value of [manifest.main, manifest.module, ...bins]) {
        if (typeof value !== 'string') continue;
        const path = `${directory}${value.replace(/^\.\//, '')}`;
        if (parseProjectFolder(path)) entryPoints.add(path);
      }
    } catch {
      /* Malformed manifests are disclosed by inspectedProject. */
    }
  }
  return entryPoints;
}

function availableImplementation(
  entries: TreeEntry[],
  scope: string,
  boundaries: ReturnType<typeof implementationBoundaries>
) {
  const { separateNames, supplementary } = boundaries;
  return entries.filter(
    (entry) =>
      inProject(entry, scope) &&
      IMPLEMENTATION.test(entry.path) &&
      (entry.size ?? MAX_FILE_BYTES + 1) <= MAX_FILE_BYTES &&
      !OPERATOR_SCRIPT.test(projectPath(entry.path, scope)) &&
      !SUPPORT_FILE.test(entry.path) &&
      !entry.path
        .toLowerCase()
        .split('/')
        .some((part) => separateNames.includes(part)) &&
      ![...supplementary].some((prefix) => projectPath(entry.path, scope).startsWith(prefix))
  );
}

function implementationTerms(prose: string) {
  const workflowProse = prose.replace(SOURCE_REFERENCE, '');
  const terms = new Set(
    (workflowProse.toLowerCase().match(SOURCE_WORDS) ?? []).filter(
      (term) =>
        ![
          'source',
          'files',
          'file',
          'project',
          'typescript',
          'javascript',
          'public',
          'current',
          'status',
          'implementation',
        ].includes(term)
    )
  );
  const referenced = new Set([...prose.matchAll(SOURCE_REFERENCE)].map((match) => match[0]));
  return { terms, referenced };
}

function rankImplementation(
  available: TreeEntry[],
  scope: string,
  hints: { terms: Set<string>; referenced: Set<string>; entryPoints: Set<string> }
): ImplementationHint[] {
  const { terms, referenced, entryPoints } = hints;
  return available
    .map((entry) => {
      const relative = projectPath(entry.path, scope);
      const words: string[] =
        relative
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .toLowerCase()
          .match(SOURCE_WORDS) ?? [];
      const matches = [
        ...new Set(
          words.filter((word) => {
            const stem = word.length >= 5;
            return [...terms].some((term) => term === word || (stem && term.startsWith(word)));
          })
        ),
      ];
      return {
        entry,
        matches,
        entryPoint: entryPoints.has(entry.path),
        referenced: referenced.has(entry.path) || referenced.has(relative),
      };
    })
    .filter(({ matches, referenced, entryPoint }) => entryPoint || referenced || matches.length);
}

function chooseImplementation(ranked: ImplementationHint[], budget: number) {
  const selected: TreeEntry[] = [];
  const covered = new Set<string>();
  // Preserve one explicitly referenced implementation, then spread the bounded
  // sample across product workflows instead of repeatedly selecting one subsystem.
  while (selected.length < budget && ranked.length) {
    ranked.sort((a, b) => {
      const score = (item: typeof a) =>
        (item.entryPoint ? 150 : 0) +
        item.matches.filter((term) => !covered.has(term)).length * 20 +
        item.matches.length +
        (item.referenced ? 60 : 0) -
        item.entry.path.length / 1000;
      return score(b) - score(a) || a.entry.path.localeCompare(b.entry.path);
    });
    const item = ranked.shift()!;
    selected.push(item.entry);
    for (const term of item.matches) covered.add(term);
  }
  return selected;
}

function implementationSource(tree: SourceTree, scope: string, loaded: LoadedFile[]) {
  const prose = implementationProse(loaded, scope);
  const available = availableImplementation(
    tree.tree,
    scope,
    implementationBoundaries(prose, scope)
  );
  const hints = { ...implementationTerms(prose), entryPoints: manifestEntryPoints(loaded) };
  const ranked = rankImplementation(available, scope, hints);
  const documents = loaded.filter((file) =>
    PRODUCT_DOCUMENT.test(projectPath(file.path, scope))
  ).length;
  return chooseImplementation(ranked, Math.max(1, 10 - documents));
}

function sourceTools(project: ProjectRecommendationRepo, loaded: LoadedFile[], readme: string) {
  const detections = mergeToolDetections([
    ...loaded
      .filter((file) => MANIFEST.test(file.path))
      .flatMap((file) => detectToolsFromManifest(file.path, file.content)),
    ...detectToolsFromRepoSignals({ readmeText: readme }),
  ]);
  const tools = new Map<string, ProjectToolSignal>(
    project.tools
      .filter((tool) => tool.confidence >= 65)
      .map((tool) => [tool.key.toLowerCase(), tool])
  );
  for (const tool of detections) {
    if (tool.confidence < 65) continue;
    const existing = tools.get(tool.toolKey);
    if (!existing || existing.confidence < tool.confidence)
      tools.set(tool.toolKey, {
        key: tool.toolKey,
        name: tool.toolName,
        category: tool.category,
        confidence: tool.confidence,
      });
  }
  return [...tools.values()].sort(
    (a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key)
  );
}

function inspectedProject<T extends ProjectRecommendationRepo>(
  project: T,
  tree: SourceTree,
  source: ReturnType<typeof selectSource>,
  files: Awaited<ReturnType<typeof loadPublicFiles>>,
  scope: string
): T {
  const readme = projectReadmeContext(
    files.loaded.find((file) => file.path === source.readme?.path)?.content ?? ''
  );
  const dependencies = manifestDependencies(files.loaded);
  const documents = files.loaded
    .filter(
      (file) =>
        PRODUCT_DOCUMENT.test(projectPath(file.path, scope)) || IMPLEMENTATION.test(file.path)
    )
    .map((file) => {
      const prose = PRODUCT_DOCUMENT.test(projectPath(file.path, scope));
      const text = prose
        ? projectReadmeContext(file.content)
        : file.content.length <= 16_000
          ? file.content
          : `${file.content.slice(0, 8000)}\n\n${file.content.slice(-8000)}`;
      return {
        path: file.path,
        text,
        truncated: prose
          ? file.content.length > MAX_PRODUCT_CONTEXT_CHARS
          : file.content.length > 16_000,
      };
    })
    .filter((document) => document.text);
  const purpose =
    documents.find((document) => /^PRODUCT\.md$/i.test(projectPath(document.path, scope)))?.text ||
    readme ||
    documents[0]?.text;
  const partial =
    source.partial ||
    files.failed ||
    dependencies.failed ||
    !documents.length ||
    documents.some((document) => document.truncated);
  return {
    ...project,
    ...(purpose
      ? {
          description: purpose.slice(0, 300),
          topics: [],
          aiSummary: null,
          aiCategory: null,
          aiKeywords: [],
        }
      : {}),
    tools: sourceTools(project, files.loaded, readme),
    sourceContext: {
      status: files.loaded.length === 0 ? 'unavailable' : partial ? 'partial' : 'complete',
      revision: tree.sha,
      readme,
      files: files.loaded.map((file) => file.path),
      ...(scope ? { scope } : {}),
      dependencies: dependencies.names,
      documents,
    },
  };
}

export function createProjectContextLoader(fetcher: typeof fetch = fetch) {
  return async function enrichProject<T extends ProjectRecommendationRepo>(
    project: T,
    accessToken?: string,
    location: ProjectLocation = {}
  ): Promise<T> {
    const unavailable: ProjectSourceContext = {
      status: 'unavailable',
      revision: null,
      readme: '',
      files: [],
    };
    let fallback =
      location.scope || location.input?.includes('/tree/') ? folderProject(project) : project;
    const slug = parseGitHubProjectInput(project.fullName);
    if (!slug) return { ...fallback, sourceContext: unavailable };
    const base = `https://api.github.com/repos/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.repo)}`;
    const signal = AbortSignal.timeout(12_000);
    const options = {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'starboard',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      signal,
      ...(accessToken ? { cache: 'no-store' as const } : { next: { revalidate: 1800 } }),
    };
    try {
      const response = await fetcher(base, options);
      if (!response.ok) return { ...fallback, sourceContext: unavailable };
      const metadata = (await response.json()) as {
        private: boolean;
        visibility?: string;
        default_branch: string;
      };
      if (metadata.private !== false || (metadata.visibility && metadata.visibility !== 'public'))
        return { ...fallback, sourceContext: unavailable };
      const { ref, scope } = sourceLocation(metadata.default_branch, location);
      fallback = scope ? folderProject(project) : project;
      if (scope) unavailable.scope = scope;
      const treeResponse = await fetcher(
        `${base}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
        options
      );
      if (!treeResponse.ok) return { ...fallback, sourceContext: unavailable };
      const tree = (await treeResponse.json()) as SourceTree;
      if (!/^[a-f0-9]{40}$/i.test(tree.sha)) return { ...fallback, sourceContext: unavailable };
      const source = selectSource(tree, scope);
      const files = await loadPublicFiles(fetcher, slug, tree.sha, source.selected, signal);
      const implementation = await loadPublicFiles(
        fetcher,
        slug,
        tree.sha,
        implementationSource(tree, scope, files.loaded),
        signal
      );
      files.loaded.push(...implementation.loaded);
      files.loaded.sort((a, b) => a.path.localeCompare(b.path));
      files.failed ||= implementation.failed;
      return inspectedProject(fallback, tree, source, files, scope);
    } catch {
      return { ...fallback, sourceContext: unavailable };
    }
  };
}

function folderProject<T extends ProjectRecommendationRepo>(project: T): T {
  return {
    ...project,
    description: null,
    language: null,
    topics: [],
    tools: [],
    aiSummary: null,
    aiCategory: null,
    aiKeywords: [],
  };
}

export const enrichProjectContext = createProjectContextLoader();
