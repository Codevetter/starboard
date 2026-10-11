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
          /^(?:what (?:it|this|you)|features|capabilities|overview|about|why|products|use cases|how .*works|purpose)\b/i.test(
            heading[2]
          );
      }
      if (heading[1].length >= 2 && !productSection) {
        skipLevel = heading[1].length;
      }
    }
    if (!skipLevel && !/^\s*[|>]/.test(line)) {
      // Long opening sections can contain dated operations receipts too.
      if (!productSection && introLength >= 1000) continue;
      const text = productSection ? line : line.slice(0, 1000 - introLength);
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

export function createProjectContextLoader(fetcher: typeof fetch = fetch) {
  return async function enrichProject<T extends ProjectRecommendationRepo>(
    project: T,
    accessToken?: string,
    location: { input?: string; scope?: string } = {}
  ): Promise<T> {
    const unavailable: ProjectSourceContext = {
      status: 'unavailable',
      revision: null,
      readme: '',
      files: [],
    };
    let fallbackProject =
      location.scope || location.input?.includes('/tree/') ? folderProject(project) : project;
    const slug = parseGitHubProjectInput(project.fullName);
    if (!slug) return { ...fallbackProject, sourceContext: unavailable };
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
      // Always verify public visibility before inspecting a catalog/connected repository.
      const metadataResponse = await fetcher(base, options);
      if (!metadataResponse.ok) return { ...fallbackProject, sourceContext: unavailable };
      const metadata = (await metadataResponse.json()) as {
        private: boolean;
        visibility?: string;
        default_branch: string;
      };
      if (metadata.private !== false || (metadata.visibility && metadata.visibility !== 'public')) {
        return { ...fallbackProject, sourceContext: unavailable };
      }
      let ref = metadata.default_branch;
      let scope = location.scope ? parseProjectFolder(location.scope) : '';
      if (location.scope && !scope) return { ...fallbackProject, sourceContext: unavailable };
      if (location.input?.includes('/tree/')) {
        const treePath = location.input.split('/tree/')[1].split(/[?#]/, 1)[0].replace(/\/$/, '');
        const parts = treePath.split('/');
        ref = decodeURIComponent(parts.shift() ?? '');
        if (!ref || !/^[a-z0-9_./-]{1,180}$/i.test(ref))
          return { ...fallbackProject, sourceContext: unavailable };
        scope = parts.length ? parseProjectFolder(parts.join('/')) : '';
        if (parts.length && !scope) return { ...fallbackProject, sourceContext: unavailable };
      }
      const scopedProject = scope ? folderProject(project) : project;
      fallbackProject = scopedProject;
      if (scope) unavailable.scope = scope;
      const treeResponse = await fetcher(
        `${base}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
        options
      );
      if (!treeResponse.ok) return { ...fallbackProject, sourceContext: unavailable };
      const tree = (await treeResponse.json()) as {
        sha: string;
        truncated?: boolean;
        tree: TreeEntry[];
      };
      if (!/^[a-f0-9]{40}$/i.test(tree.sha))
        return { ...fallbackProject, sourceContext: unavailable };
      const available = tree.tree.filter(
        (entry) =>
          entry.type === 'blob' &&
          (entry.size ?? MAX_FILE_BYTES + 1) <= MAX_FILE_BYTES &&
          (!scope || entry.path.startsWith(`${scope}/`)) &&
          !EXCLUDED.test(entry.path)
      );
      const readme = available.find((entry) =>
        /^readme(?:\.md|\.markdown|\.rst|\.txt)?$/i.test(
          scope ? entry.path.slice(scope.length + 1) : entry.path
        )
      );
      const manifests = available
        .filter((entry) => MANIFEST.test(entry.path))
        .sort(
          (a, b) =>
            a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path)
        );
      const selected = [...(readme ? [readme] : []), ...manifests].slice(0, MAX_FILES);
      const loaded: Array<{ path: string; content: string }> = [];
      let failed =
        Boolean(tree.truncated) ||
        selected.length < manifests.length + Number(Boolean(readme)) ||
        tree.tree.some(
          (entry) =>
            entry.type === 'blob' &&
            MANIFEST.test(entry.path) &&
            (!scope || entry.path.startsWith(`${scope}/`)) &&
            !EXCLUDED.test(entry.path) &&
            (entry.size ?? 0) > MAX_FILE_BYTES
        );
      // Raw requests deliberately carry no OAuth token: private file contents cannot
      // be exposed even if visibility changes between the metadata and source requests.
      for (let offset = 0; offset < selected.length; offset += 4) {
        await Promise.all(
          selected.slice(offset, offset + 4).map(async (entry) => {
            try {
              const path = entry.path.split('/').map(encodeURIComponent).join('/');
              const response = await fetcher(
                `https://raw.githubusercontent.com/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.repo)}/${tree.sha}/${path}`,
                {
                  signal,
                  next: { revalidate: 1800 },
                }
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
      const fullReadme = loaded.find((file) => file.path === readme?.path)?.content ?? '';
      const dependencyNames = new Set<string>();
      for (const file of loaded) {
        if (!file.path.endsWith('package.json')) continue;
        try {
          const manifest = JSON.parse(file.content) as Record<string, Record<string, unknown>>;
          for (const key of [
            'dependencies',
            'devDependencies',
            'peerDependencies',
            'optionalDependencies',
          ]) {
            for (const name of Object.keys(manifest[key] ?? {})) dependencyNames.add(name);
          }
        } catch {
          failed = true;
        }
      }
      const detections = mergeToolDetections([
        ...loaded
          .filter((file) => MANIFEST.test(file.path))
          .flatMap((file) => detectToolsFromManifest(file.path, file.content)),
        ...detectToolsFromRepoSignals({ readmeText: projectReadmeContext(fullReadme) }),
      ]);
      const tools = new Map<string, ProjectToolSignal>(
        scopedProject.tools
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
      return {
        ...scopedProject,
        ...(scope ? { description: projectReadmeContext(fullReadme).slice(0, 300) || null } : {}),
        tools: [...tools.values()].sort(
          (a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key)
        ),
        sourceContext: {
          status: loaded.length === 0 ? 'unavailable' : failed ? 'partial' : 'complete',
          revision: tree.sha,
          readme: projectReadmeContext(fullReadme),
          files: loaded.map((file) => file.path),
          ...(scope ? { scope } : {}),
          dependencies: [...dependencyNames].sort().slice(0, 200),
        },
      };
    } catch {
      return { ...fallbackProject, sourceContext: unavailable };
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
