export type ToolCategory =
  | 'ai'
  | 'build'
  | 'cloud'
  | 'database'
  | 'framework'
  | 'infra'
  | 'language'
  | 'library'
  | 'package-manager'
  | 'testing'
  | 'ui';

export interface ToolDefinition {
  key: string;
  name: string;
  category: ToolCategory;
  aliases: string[];
}

export interface ToolDetection {
  toolKey: string;
  toolName: string;
  category: ToolCategory;
  confidence: number;
  sources: string[];
}

export interface RepoSignalSource {
  language?: string | null;
  topics?: string[] | string | null;
  description?: string | null;
  aiKeywords?: string[] | string | null;
}

export const TOOL_ACCURACY_DISCLAIMER =
  'Tool detection is evidence-based, not a full runtime audit. Package manifests, lockfiles, and SBOMs are high-confidence; README, topics, language, and AI metadata are lower-confidence signals. Accuracy varies by ecosystem, especially for C/C++ and custom monorepos.';

const toolDefinitions: ToolDefinition[] = [
  def('typescript', 'TypeScript', 'language', ['typescript', 'tsconfig']),
  def('javascript', 'JavaScript', 'language', ['javascript', 'nodejs', 'node.js']),
  def('python', 'Python', 'language', ['python', 'pyproject']),
  def('rust', 'Rust', 'language', ['rust', 'cargo']),
  def('go', 'Go', 'language', ['go', 'golang', 'go.mod']),
  def('java', 'Java', 'language', ['java', 'maven', 'gradle']),
  def('kotlin', 'Kotlin', 'language', ['kotlin']),
  def('swift', 'Swift', 'language', ['swift', 'package.swift']),
  def('c', 'C', 'language', ['c']),
  def('cpp', 'C++', 'language', ['c++', 'cpp', 'cxx']),
  def('react', 'React', 'framework', ['react', 'react-dom']),
  def('next', 'Next.js', 'framework', ['next', 'nextjs', 'next.js']),
  def('vite', 'Vite', 'build', ['vite']),
  def('astro', 'Astro', 'framework', ['astro']),
  def('svelte', 'Svelte', 'framework', ['svelte', 'sveltekit', '@sveltejs/kit']),
  def('vue', 'Vue', 'framework', ['vue', 'nuxt', 'nuxtjs']),
  def('angular', 'Angular', 'framework', ['angular', '@angular/core']),
  def('tailwind', 'Tailwind CSS', 'ui', ['tailwindcss', 'tailwind']),
  def('shadcn', 'shadcn/ui', 'ui', ['shadcn']),
  def('radix', 'Radix UI', 'ui', ['radix-ui', '@radix-ui/react']),
  def('lucide', 'Lucide', 'ui', ['lucide-react', 'lucide']),
  def('express', 'Express', 'framework', ['express']),
  def('fastify', 'Fastify', 'framework', ['fastify']),
  def('hono', 'Hono', 'framework', ['hono']),
  def('django', 'Django', 'framework', ['django']),
  def('flask', 'Flask', 'framework', ['flask']),
  def('fastapi', 'FastAPI', 'framework', ['fastapi']),
  def('rails', 'Ruby on Rails', 'framework', ['rails', 'railties']),
  def('laravel', 'Laravel', 'framework', ['laravel']),
  def('spring', 'Spring', 'framework', ['spring-boot', 'springframework', 'spring']),
  def('tauri', 'Tauri', 'framework', ['tauri', '@tauri-apps/api']),
  def('electron', 'Electron', 'framework', ['electron']),
  def('react-native', 'React Native', 'framework', ['react-native', 'expo']),
  def('vitest', 'Vitest', 'testing', ['vitest']),
  def('jest', 'Jest', 'testing', ['jest']),
  def('playwright', 'Playwright', 'testing', ['playwright', '@playwright/test']),
  def('cypress', 'Cypress', 'testing', ['cypress']),
  def('pytest', 'pytest', 'testing', ['pytest']),
  def('ruff', 'Ruff', 'testing', ['ruff']),
  def('biome', 'Biome', 'testing', ['@biomejs/biome', 'biome']),
  def('eslint', 'ESLint', 'testing', ['eslint']),
  def('prettier', 'Prettier', 'testing', ['prettier']),
  def('postgres', 'PostgreSQL', 'database', ['postgres', 'postgresql', 'pg']),
  def('sqlite', 'SQLite', 'database', ['sqlite', 'sqlite3', 'libsql', '@libsql/client']),
  def('mysql', 'MySQL', 'database', ['mysql', 'mysql2', 'mariadb']),
  def('redis', 'Redis', 'database', ['redis', 'ioredis']),
  def('mongodb', 'MongoDB', 'database', ['mongodb', 'mongoose']),
  def('prisma', 'Prisma', 'database', ['prisma', '@prisma/client']),
  def('drizzle', 'Drizzle ORM', 'database', ['drizzle-orm', 'drizzle']),
  def('supabase', 'Supabase', 'cloud', ['supabase', '@supabase/supabase-js']),
  def('firebase', 'Firebase', 'cloud', ['firebase']),
  def('cloudflare-workers', 'Cloudflare Workers', 'cloud', [
    'cloudflare-workers',
    'wrangler',
    '@cloudflare/workers-types',
    '@opennextjs/cloudflare',
  ]),
  def('vercel', 'Vercel', 'cloud', ['vercel', '@vercel']),
  def('netlify', 'Netlify', 'cloud', ['netlify']),
  def('docker', 'Docker', 'infra', ['docker', 'dockerfile', 'docker-compose']),
  def('terraform', 'Terraform', 'infra', ['terraform', '.tf']),
  def('github-actions', 'GitHub Actions', 'infra', ['github actions', '.github/workflows']),
  def('openai', 'OpenAI', 'ai', ['openai', '@openai/agents', 'gpt']),
  def('anthropic', 'Anthropic', 'ai', ['anthropic', '@anthropic-ai/sdk', 'claude']),
  def('langchain', 'LangChain', 'ai', ['langchain', '@langchain/core']),
  def('llamaindex', 'LlamaIndex', 'ai', ['llamaindex', 'llama-index']),
  def('transformers', 'Transformers', 'ai', ['transformers', '@huggingface/transformers']),
  def('cmake', 'CMake', 'build', ['cmake', 'cmakelists.txt']),
  def('conan', 'Conan', 'package-manager', ['conan', 'conanfile']),
  def('vcpkg', 'vcpkg', 'package-manager', ['vcpkg', 'vcpkg.json']),
  def('meson', 'Meson', 'build', ['meson', 'meson.build']),
  def('bazel', 'Bazel', 'build', ['bazel', 'workspace', 'module.bazel']),
  def('maven', 'Maven', 'package-manager', ['maven', 'pom.xml']),
  def('gradle', 'Gradle', 'package-manager', ['gradle', 'build.gradle']),
  def('npm', 'npm', 'package-manager', ['npm', 'package-lock.json']),
  def('pnpm', 'pnpm', 'package-manager', ['pnpm', 'pnpm-lock.yaml']),
  def('yarn', 'Yarn', 'package-manager', ['yarn', 'yarn.lock']),
  def('uv', 'uv', 'package-manager', ['uv', 'uv.lock']),
  def('poetry', 'Poetry', 'package-manager', ['poetry', 'poetry.lock']),
  def('cargo', 'Cargo', 'package-manager', ['cargo', 'cargo.toml']),
];

const definitionsByAlias = new Map<string, ToolDefinition>();
for (const definition of toolDefinitions) {
  definitionsByAlias.set(normalizeToken(definition.key), definition);
  definitionsByAlias.set(normalizeToken(definition.name), definition);
  for (const alias of definition.aliases) {
    definitionsByAlias.set(normalizeToken(alias), definition);
  }
}

function def(
  key: string,
  name: string,
  category: ToolCategory,
  aliases: string[] = []
): ToolDefinition {
  return { key, name, category, aliases };
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^@/, '')
    .replace(/[^a-z0-9+#./_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function knownTool(value: string): ToolDefinition | null {
  const normalized = normalizeToken(value);
  if (definitionsByAlias.has(normalized)) return definitionsByAlias.get(normalized)!;
  const scopedBase = normalized.split('/').pop();
  return scopedBase ? (definitionsByAlias.get(scopedBase) ?? null) : null;
}

function detection(tool: ToolDefinition, confidence: number, source: string): ToolDetection {
  return {
    toolKey: tool.key,
    toolName: tool.name,
    category: tool.category,
    confidence,
    sources: [source],
  };
}

export function mergeToolDetections(detections: ToolDetection[]): ToolDetection[] {
  const merged = new Map<string, ToolDetection>();
  for (const item of detections) {
    const existing = merged.get(item.toolKey);
    if (!existing) {
      merged.set(item.toolKey, {
        ...item,
        sources: [...new Set(item.sources)].sort(),
      });
      continue;
    }

    existing.confidence = Math.max(existing.confidence, item.confidence);
    existing.sources = [...new Set([...existing.sources, ...item.sources])].sort();
  }
  return [...merged.values()].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.toolName.localeCompare(b.toolName);
  });
}

function parseStringArray(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export function detectToolsFromRepoSignals(source: RepoSignalSource): ToolDetection[] {
  const detections: ToolDetection[] = [];
  const languageTool = source.language ? knownTool(source.language) : null;
  if (languageTool) detections.push(detection(languageTool, 60, 'github-language'));

  for (const topic of parseStringArray(source.topics)) {
    const tool = knownTool(topic);
    if (tool) detections.push(detection(tool, 55, 'github-topic'));
  }

  for (const keyword of parseStringArray(source.aiKeywords)) {
    const tool = knownTool(keyword);
    if (tool) detections.push(detection(tool, 45, 'ai-metadata'));
  }

  const description = source.description?.toLowerCase() ?? '';
  for (const definition of toolDefinitions) {
    if (
      definition.aliases.some(
        (alias) => alias.length > 3 && description.includes(alias.toLowerCase())
      )
    ) {
      detections.push(detection(definition, 35, 'description'));
    }
  }

  return mergeToolDetections(detections);
}

export function detectToolsFromSbomPackageNames(packageNames: string[]): ToolDetection[] {
  return mergeToolDetections(
    packageNames.flatMap((name) => {
      const tool = knownTool(name);
      return tool ? [detection(tool, 98, 'github-sbom')] : [];
    })
  );
}

export function detectToolsFromManifest(path: string, content: string): ToolDetection[] {
  const lowerPath = path.toLowerCase();
  const detections: ToolDetection[] = [];
  const addKnown = (name: string, confidence: number, source = path) => {
    const tool = knownTool(name);
    if (tool) detections.push(detection(tool, confidence, source));
  };
  const addDirect = (key: string, confidence: number, source = path) => {
    const tool = knownTool(key);
    if (tool) detections.push(detection(tool, confidence, source));
  };

  if (lowerPath.endsWith('package.json')) {
    try {
      const pkg = JSON.parse(content) as Record<string, Record<string, string> | string>;
      for (const section of [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
      ]) {
        const deps = pkg[section];
        if (deps && typeof deps === 'object') {
          for (const name of Object.keys(deps)) addKnown(name, 92);
        }
      }
      const packageManager = typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
      if (packageManager.startsWith('pnpm')) addDirect('pnpm', 95);
      if (packageManager.startsWith('yarn')) addDirect('yarn', 95);
      if (packageManager.startsWith('npm')) addDirect('npm', 95);
    } catch {
      // Invalid package.json is ignored; other files may still provide signals.
    }
  } else if (lowerPath.endsWith('package-lock.json')) {
    addDirect('npm', 98);
  } else if (lowerPath.endsWith('pnpm-lock.yaml')) {
    addDirect('pnpm', 98);
  } else if (lowerPath.endsWith('yarn.lock')) {
    addDirect('yarn', 98);
  } else if (lowerPath.endsWith('pyproject.toml')) {
    if (/\[tool\.poetry\]/i.test(content)) addDirect('poetry', 92);
    if (/\[tool\.uv\]/i.test(content) || /uv_build/i.test(content)) addDirect('uv', 88);
    for (const match of content.matchAll(/["']([A-Za-z0-9_.-]+)(?:[<=>~! ].*)?["']/g)) {
      addKnown(match[1]!, 86);
    }
  } else if (lowerPath.endsWith('requirements.txt')) {
    for (const line of content.split('\n')) {
      const name = line.trim().match(/^([A-Za-z0-9_.-]+)/)?.[1];
      if (name) addKnown(name, 88);
    }
  } else if (lowerPath.endsWith('uv.lock')) {
    addDirect('uv', 98);
    for (const match of content.matchAll(/name\s*=\s*["']([^"']+)["']/g)) addKnown(match[1]!, 92);
  } else if (lowerPath.endsWith('poetry.lock')) {
    addDirect('poetry', 98);
    for (const match of content.matchAll(/name\s*=\s*["']([^"']+)["']/g)) addKnown(match[1]!, 92);
  } else if (lowerPath.endsWith('cargo.toml') || lowerPath.endsWith('cargo.lock')) {
    addDirect('cargo', 98);
    for (const match of content.matchAll(/(?:^|\n)\s*([A-Za-z0-9_-]+)\s*=/g)) {
      addKnown(match[1]!, 88);
    }
  } else if (lowerPath.endsWith('go.mod')) {
    addDirect('go', 95);
    for (const match of content.matchAll(/(?:require\s+|\n\s*)([A-Za-z0-9_.~/-]+)/g)) {
      addKnown(match[1]!, 88);
    }
  } else if (lowerPath.endsWith('pom.xml')) {
    addDirect('maven', 96);
    for (const match of content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)) {
      addKnown(match[1]!, 88);
    }
  } else if (lowerPath.endsWith('build.gradle') || lowerPath.endsWith('build.gradle.kts')) {
    addDirect('gradle', 96);
    for (const match of content.matchAll(/["']([A-Za-z0-9_.:-]+)["']/g)) addKnown(match[1]!, 84);
  } else if (/\.(csproj|fsproj)$/.test(lowerPath) || lowerPath.endsWith('.sln')) {
    for (const match of content.matchAll(/PackageReference Include=["']([^"']+)["']/g)) {
      addKnown(match[1]!, 90);
    }
  } else if (lowerPath.endsWith('gemfile')) {
    for (const match of content.matchAll(/gem\s+["']([^"']+)["']/g)) addKnown(match[1]!, 90);
  } else if (lowerPath.endsWith('composer.json')) {
    try {
      const composer = JSON.parse(content) as Record<string, Record<string, string>>;
      for (const section of ['require', 'require-dev']) {
        for (const name of Object.keys(composer[section] ?? {})) addKnown(name, 90);
      }
    } catch {}
  } else if (lowerPath.endsWith('package.swift')) {
    addDirect('swift', 90);
    for (const match of content.matchAll(/package:\s*"([^"]+)"/g)) addKnown(match[1]!, 84);
  } else if (lowerPath.endsWith('cmakelists.txt')) {
    addDirect('cmake', 90);
    for (const match of content.matchAll(/find_package\s*\(\s*([A-Za-z0-9_+-]+)/gi)) {
      addKnown(match[1]!, 78);
    }
  } else if (lowerPath.includes('conanfile')) {
    addDirect('conan', 95);
    for (const match of content.matchAll(
      /(?:requires|self\.requires)\s*(?:=|\()\s*["']([^/"']+)/g
    )) {
      addKnown(match[1]!, 84);
    }
  } else if (lowerPath.endsWith('vcpkg.json')) {
    addDirect('vcpkg', 96);
    try {
      const vcpkg = JSON.parse(content) as { dependencies?: Array<string | { name?: string }> };
      for (const dep of vcpkg.dependencies ?? []) {
        addKnown(typeof dep === 'string' ? dep : (dep.name ?? ''), 88);
      }
    } catch {}
  } else if (lowerPath.endsWith('meson.build')) {
    addDirect('meson', 90);
    for (const match of content.matchAll(/dependency\s*\(\s*["']([^"']+)["']/g)) {
      addKnown(match[1]!, 78);
    }
  } else if (lowerPath.endsWith('workspace') || lowerPath.endsWith('module.bazel')) {
    addDirect('bazel', 92);
  } else if (lowerPath.endsWith('dockerfile') || lowerPath.endsWith('docker-compose.yml')) {
    addDirect('docker', 90);
    for (const match of content.matchAll(/FROM\s+([A-Za-z0-9_./-]+)/gi)) addKnown(match[1]!, 72);
  } else if (lowerPath.includes('.github/workflows/') && /\.ya?ml$/.test(lowerPath)) {
    addDirect('github-actions', 88);
    for (const match of content.matchAll(/uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)) {
      addKnown(match[1]!, 70);
    }
  } else if (lowerPath.endsWith('wrangler.jsonc') || lowerPath.endsWith('wrangler.toml')) {
    addDirect('cloudflare-workers', 95);
  } else if (lowerPath.endsWith('.tf')) {
    addDirect('terraform', 90);
  }

  return mergeToolDetections(detections);
}

export function isPotentialToolManifest(path: string): boolean {
  const lower = path.toLowerCase();
  if (/(^|\/)(node_modules|vendor|dist|build|target|coverage|\.next)\//.test(lower)) return false;
  return (
    lower.endsWith('package.json') ||
    lower.endsWith('package-lock.json') ||
    lower.endsWith('pnpm-lock.yaml') ||
    lower.endsWith('yarn.lock') ||
    lower.endsWith('pyproject.toml') ||
    lower.endsWith('requirements.txt') ||
    lower.endsWith('uv.lock') ||
    lower.endsWith('poetry.lock') ||
    lower.endsWith('cargo.toml') ||
    lower.endsWith('cargo.lock') ||
    lower.endsWith('go.mod') ||
    lower.endsWith('pom.xml') ||
    lower.endsWith('build.gradle') ||
    lower.endsWith('build.gradle.kts') ||
    /\.(csproj|fsproj|sln)$/.test(lower) ||
    lower.endsWith('gemfile') ||
    lower.endsWith('composer.json') ||
    lower.endsWith('package.swift') ||
    lower.endsWith('cmakelists.txt') ||
    /(^|\/)conanfile\.(txt|py)$/.test(lower) ||
    lower.endsWith('vcpkg.json') ||
    lower.endsWith('meson.build') ||
    lower.endsWith('workspace') ||
    lower.endsWith('module.bazel') ||
    lower.endsWith('dockerfile') ||
    lower.endsWith('docker-compose.yml') ||
    lower.includes('.github/workflows/') ||
    lower.endsWith('wrangler.jsonc') ||
    lower.endsWith('wrangler.toml') ||
    lower.endsWith('.tf')
  );
}
