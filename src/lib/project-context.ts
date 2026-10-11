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
  documents?: { path: string; text: string }[];
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
  /(?:^|\/)(?:node_modules|vendor|dist|build|target|coverage|\.next|\.git|\.claude|\.codex|examples?|fixtures?|tests?|docs)(?:\/|$)/i;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 100_000;
const PRODUCT_DOCUMENT =
  /^(?:PRODUCT\.md|README(?:\.md|\.markdown|\.rst|\.txt)?|docs\/product\/(?:overview|features)\.md)$/i;

/** Keep product/features prose; install commands and dependency tables drown out purpose. */
export function projectReadmeContext(markdown: string): string {
  let skipLevel = 0;
  const lines: string[] = [];
  let introLength = 0;
  let productSection = false;
  for (const line of markdown.replace(/```[\s\S]*?```/g, '').split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) {
      if (skipLevel && heading[1].length <= skipLevel) skipLevel = 0;
      if (heading[1].length <= 2 && heading[1].length > 1) {
        productSection =
          /^(?:what (?:it|this|you)|features|capabilities|overview|about|why|products?|use cases|how .*works|purpose|audience|users?|scope|non-goals|out of scope|constraints|boundaries|inputs?|outputs?|workflows?|current|pack your|supported|memory chat)\b/i.test(
            heading[2]
          );
      }
      if (heading[1].length >= 2 && !productSection) {
        skipLevel = heading[1].length;
      }
    }
    if (!skipLevel && !/^\s*[|>]/.test(line)) {
      // Long opening sections can contain dated operations receipts too.
      if (!productSection && introLength >= 3000) continue;
      const text = productSection ? line : line.slice(0, 3000 - introLength);
      lines.push(text);
      if (!productSection) introLength += text.length;
    }
  }
  return lines
    .join('\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
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
    .filter((file) => PRODUCT_DOCUMENT.test(projectPath(file.path, scope)))
    .map((file) => ({ path: file.path, text: projectReadmeContext(file.content) }))
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
    documents.some((document) => document.text.length >= 4000);
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
