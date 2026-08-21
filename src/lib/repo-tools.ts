type ToolCategory =
  | 'ai'
  | 'build'
  | 'cloud'
  | 'database'
  | 'framework'
  | 'infra'
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
  aiMetadataText?: string | null;
  readmeText?: string | null;
}

interface ManifestDetectContext {
  addKnown: (name: string, confidence: number, source?: string) => void;
  addDirect: (key: string, confidence: number, source?: string) => void;
}

type ManifestHandler = (content: string, ctx: ManifestDetectContext) => void;

interface ManifestRoute {
  test: (lowerPath: string) => boolean;
  handler: ManifestHandler;
}

export const TOOL_ACCURACY_DISCLAIMER =
  'Tool detection is evidence-based, not a full runtime audit. Package manifests, lockfiles, and SBOMs are high-confidence; README, topics, and AI metadata are lower-confidence signals. Repository language is metadata, not counted as a tool. Accuracy varies by ecosystem, especially for C/C++ and custom monorepos.';

const toolDefinitions: ToolDefinition[] = [
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

const toolUrls: Record<string, string> = {
  angular: 'https://angular.dev',
  anthropic: 'https://www.anthropic.com',
  astro: 'https://astro.build',
  bazel: 'https://bazel.build',
  biome: 'https://biomejs.dev',
  cargo: 'https://doc.rust-lang.org/cargo/',
  'cloudflare-workers': 'https://developers.cloudflare.com/workers/',
  cmake: 'https://cmake.org',
  conan: 'https://conan.io',
  cypress: 'https://www.cypress.io',
  django: 'https://www.djangoproject.com',
  docker: 'https://www.docker.com',
  drizzle: 'https://orm.drizzle.team',
  electron: 'https://www.electronjs.org',
  eslint: 'https://eslint.org',
  express: 'https://expressjs.com',
  fastapi: 'https://fastapi.tiangolo.com',
  fastify: 'https://fastify.dev',
  firebase: 'https://firebase.google.com',
  flask: 'https://flask.palletsprojects.com',
  'github-actions': 'https://github.com/features/actions',
  go: 'https://go.dev',
  gradle: 'https://gradle.org',
  hono: 'https://hono.dev',
  java: 'https://www.java.com',
  javascript: 'https://developer.mozilla.org/docs/Web/JavaScript',
  jest: 'https://jestjs.io',
  kotlin: 'https://kotlinlang.org',
  langchain: 'https://www.langchain.com',
  laravel: 'https://laravel.com',
  llamaindex: 'https://www.llamaindex.ai',
  lucide: 'https://lucide.dev',
  maven: 'https://maven.apache.org',
  meson: 'https://mesonbuild.com',
  mongodb: 'https://www.mongodb.com',
  mysql: 'https://www.mysql.com',
  netlify: 'https://www.netlify.com',
  next: 'https://nextjs.org',
  npm: 'https://www.npmjs.com',
  openai: 'https://openai.com',
  playwright: 'https://playwright.dev',
  pnpm: 'https://pnpm.io',
  poetry: 'https://python-poetry.org',
  postgres: 'https://www.postgresql.org',
  prettier: 'https://prettier.io',
  prisma: 'https://www.prisma.io',
  pytest: 'https://docs.pytest.org',
  python: 'https://www.python.org',
  radix: 'https://www.radix-ui.com',
  rails: 'https://rubyonrails.org',
  react: 'https://react.dev',
  'react-native': 'https://reactnative.dev',
  redis: 'https://redis.io',
  ruff: 'https://docs.astral.sh/ruff/',
  rust: 'https://www.rust-lang.org',
  shadcn: 'https://ui.shadcn.com',
  spring: 'https://spring.io',
  sqlite: 'https://www.sqlite.org',
  supabase: 'https://supabase.com',
  svelte: 'https://svelte.dev',
  swift: 'https://www.swift.org',
  tailwind: 'https://tailwindcss.com',
  tauri: 'https://tauri.app',
  terraform: 'https://www.terraform.io',
  transformers: 'https://huggingface.co/docs/transformers',
  typescript: 'https://www.typescriptlang.org',
  uv: 'https://docs.astral.sh/uv/',
  vcpkg: 'https://vcpkg.io',
  vercel: 'https://vercel.com',
  vite: 'https://vite.dev',
  vitest: 'https://vitest.dev',
  vue: 'https://vuejs.org',
  yarn: 'https://yarnpkg.com',
};

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

export function getToolDefinition(toolKey: string): ToolDefinition | null {
  return definitionsByAlias.get(normalizeToken(toolKey)) ?? null;
}

export function getToolUrl(toolKey: string): string {
  const normalized = normalizeToken(toolKey);
  return toolUrls[normalized] ?? `https://github.com/topics/${encodeURIComponent(normalized)}`;
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

const COMMA_SPACE_RE = /[,\s]+/;

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
      .split(COMMA_SPACE_RE)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export function detectToolsFromRepoSignals(source: RepoSignalSource): ToolDetection[] {
  const detections: ToolDetection[] = [];

  for (const topic of parseStringArray(source.topics)) {
    const tool = knownTool(topic);
    if (tool) detections.push(detection(tool, 55, 'github-topic'));
  }

  for (const keyword of parseStringArray(source.aiKeywords)) {
    const tool = knownTool(keyword);
    if (tool) detections.push(detection(tool, 45, 'ai-metadata'));
  }

  const description = source.description?.toLowerCase() ?? '';
  const inferredTextSources = [
    { text: description, confidence: 35, source: 'description' },
    { text: source.aiMetadataText?.toLowerCase() ?? '', confidence: 45, source: 'ai-metadata' },
    { text: source.readmeText?.toLowerCase() ?? '', confidence: 40, source: 'cached-readme' },
  ];
  for (const inferred of inferredTextSources) {
    if (!inferred.text) continue;
    for (const definition of toolDefinitions) {
      if (
        definition.aliases.some(
          (alias) => alias.length > 3 && inferred.text.includes(alias.toLowerCase())
        )
      ) {
        detections.push(detection(definition, inferred.confidence, inferred.source));
      }
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

function detectFromPackageJson(content: string, ctx: ManifestDetectContext): void {
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
        for (const name of Object.keys(deps)) ctx.addKnown(name, 92);
      }
    }
    const packageManager = typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
    if (packageManager.startsWith('pnpm')) ctx.addDirect('pnpm', 95);
    if (packageManager.startsWith('yarn')) ctx.addDirect('yarn', 95);
    if (packageManager.startsWith('npm')) ctx.addDirect('npm', 95);
  } catch {
    // Invalid package.json is ignored; other files may still provide signals.
  }
}

const PYPROJECT_DEP_RE = /["']([A-Za-z0-9_.-]+)(?:[<=>~! ].*)?["']/g;

function detectFromPyproject(content: string, ctx: ManifestDetectContext): void {
  if (/\[tool\.poetry\]/i.test(content)) ctx.addDirect('poetry', 92);
  if (/\[tool\.uv\]/i.test(content) || /uv_build/i.test(content)) ctx.addDirect('uv', 88);
  for (const match of content.matchAll(PYPROJECT_DEP_RE)) {
    ctx.addKnown(match[1]!, 86);
  }
}

const REQUIREMENTS_NAME_RE = /^([A-Za-z0-9_.-]+)/;

function detectFromRequirements(content: string, ctx: ManifestDetectContext): void {
  for (const line of content.split('\n')) {
    const name = line.trim().match(REQUIREMENTS_NAME_RE)?.[1];
    if (name) ctx.addKnown(name, 88);
  }
}

function detectFromCargo(content: string, ctx: ManifestDetectContext): void {
  ctx.addDirect('cargo', 98);
  for (const match of content.matchAll(/(?:^|\n)\s*([A-Za-z0-9_-]+)\s*=/g)) {
    ctx.addKnown(match[1]!, 88);
  }
}

function detectFromGoMod(content: string, ctx: ManifestDetectContext): void {
  ctx.addDirect('go', 95);
  for (const match of content.matchAll(/(?:require\s+|\n\s*)([A-Za-z0-9_.~/-]+)/g)) {
    ctx.addKnown(match[1]!, 88);
  }
}

function detectFromPom(content: string, ctx: ManifestDetectContext): void {
  ctx.addDirect('maven', 96);
  for (const match of content.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)) {
    ctx.addKnown(match[1]!, 88);
  }
}

const GRADLE_DEP_RE = /["']([A-Za-z0-9_.:-]+)["']/g;

function detectFromGradle(content: string, ctx: ManifestDetectContext): void {
  ctx.addDirect('gradle', 96);
  for (const match of content.matchAll(GRADLE_DEP_RE)) ctx.addKnown(match[1]!, 84);
}

const DOTNET_PKG_REF_RE = /PackageReference Include=["']([^"']+)["']/g;

function detectFromDotnet(content: string, ctx: ManifestDetectContext): void {
  for (const match of content.matchAll(DOTNET_PKG_REF_RE)) {
    ctx.addKnown(match[1]!, 90);
  }
}

const GEMFILE_GEM_RE = /gem\s+["']([^"']+)["']/g;

function detectFromGemfile(content: string, ctx: ManifestDetectContext): void {
  for (const match of content.matchAll(GEMFILE_GEM_RE)) ctx.addKnown(match[1]!, 90);
}

function detectFromComposer(content: string, ctx: ManifestDetectContext): void {
  try {
    const composer = JSON.parse(content) as Record<string, Record<string, string>>;
    for (const section of ['require', 'require-dev']) {
      for (const name of Object.keys(composer[section] ?? {})) ctx.addKnown(name, 90);
    }
  } catch {}
}

function detectFromPackageSwift(content: string, ctx: ManifestDetectContext): void {
  ctx.addDirect('swift', 90);
  for (const match of content.matchAll(/package:\s*"([^"]+)"/g)) ctx.addKnown(match[1]!, 84);
}

const CMAKE_FIND_PACKAGE_RE = /find_package\s*\(\s*([A-Za-z0-9_+-]+)/gi;

function detectFromCmake(content: string, ctx: ManifestDetectContext): void {
  ctx.addDirect('cmake', 90);
  const matches = content.match(CMAKE_FIND_PACKAGE_RE);
  if (matches) for (const m of matches) ctx.addKnown(m, 78);
}

const CONAN_REQUIRES_RE = /(?:requires|self\.requires)\s*(?:=|\()\s*["']([^/"']+)/g;

function detectFromConan(content: string, ctx: ManifestDetectContext): void {
  ctx.addDirect('conan', 95);
  for (const match of content.matchAll(CONAN_REQUIRES_RE)) {
    ctx.addKnown(match[1]!, 84);
  }
}

interface VcpkgDependency {
  name?: string;
}

interface VcpkgManifest {
  dependencies?: Array<string | VcpkgDependency>;
}

function detectFromVcpkg(content: string, ctx: ManifestDetectContext): void {
  ctx.addDirect('vcpkg', 96);
  try {
    const vcpkg = JSON.parse(content) as VcpkgManifest;
    for (const dep of vcpkg.dependencies ?? []) {
      ctx.addKnown(typeof dep === 'string' ? dep : (dep.name ?? ''), 88);
    }
  } catch {}
}

const MESON_DEP_RE = /dependency\s*\(\s*["']([^"']+)["']/g;

function detectFromMeson(content: string, ctx: ManifestDetectContext): void {
  ctx.addDirect('meson', 90);
  for (const match of content.matchAll(MESON_DEP_RE)) {
    ctx.addKnown(match[1]!, 78);
  }
}

function detectFromDocker(content: string, ctx: ManifestDetectContext): void {
  ctx.addDirect('docker', 90);
  for (const match of content.matchAll(/FROM\s+([A-Za-z0-9_./-]+)/gi)) ctx.addKnown(match[1]!, 72);
}

function detectFromGitHubWorkflow(content: string, ctx: ManifestDetectContext): void {
  ctx.addDirect('github-actions', 88);
  for (const match of content.matchAll(/uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)) {
    ctx.addKnown(match[1]!, 70);
  }
}

const LOCKFILE_NAME_RE = /name\s*=\s*["']([^"']+)["']/g;

function detectFromLockfileNames(content: string, ctx: ManifestDetectContext, key: string): void {
  ctx.addDirect(key, 98);
  for (const match of content.matchAll(LOCKFILE_NAME_RE)) ctx.addKnown(match[1]!, 92);
}

const manifestRoutes: ManifestRoute[] = [
  { test: (p) => p.endsWith('package.json'), handler: detectFromPackageJson },
  { test: (p) => p.endsWith('package-lock.json'), handler: (_, ctx) => ctx.addDirect('npm', 98) },
  { test: (p) => p.endsWith('pnpm-lock.yaml'), handler: (_, ctx) => ctx.addDirect('pnpm', 98) },
  { test: (p) => p.endsWith('yarn.lock'), handler: (_, ctx) => ctx.addDirect('yarn', 98) },
  { test: (p) => p.endsWith('pyproject.toml'), handler: detectFromPyproject },
  { test: (p) => p.endsWith('requirements.txt'), handler: detectFromRequirements },
  {
    test: (p) => p.endsWith('uv.lock'),
    handler: (c, ctx) => detectFromLockfileNames(c, ctx, 'uv'),
  },
  {
    test: (p) => p.endsWith('poetry.lock'),
    handler: (c, ctx) => detectFromLockfileNames(c, ctx, 'poetry'),
  },
  { test: (p) => p.endsWith('cargo.toml') || p.endsWith('cargo.lock'), handler: detectFromCargo },
  { test: (p) => p.endsWith('go.mod'), handler: detectFromGoMod },
  { test: (p) => p.endsWith('pom.xml'), handler: detectFromPom },
  {
    test: (p) => p.endsWith('build.gradle') || p.endsWith('build.gradle.kts'),
    handler: detectFromGradle,
  },
  { test: (p) => /\.(csproj|fsproj)$/.test(p) || p.endsWith('.sln'), handler: detectFromDotnet },
  { test: (p) => p.endsWith('gemfile'), handler: detectFromGemfile },
  { test: (p) => p.endsWith('composer.json'), handler: detectFromComposer },
  { test: (p) => p.endsWith('package.swift'), handler: detectFromPackageSwift },
  { test: (p) => p.endsWith('cmakelists.txt'), handler: detectFromCmake },
  { test: (p) => p.includes('conanfile'), handler: detectFromConan },
  { test: (p) => p.endsWith('vcpkg.json'), handler: detectFromVcpkg },
  { test: (p) => p.endsWith('meson.build'), handler: detectFromMeson },
  {
    test: (p) => p.endsWith('workspace') || p.endsWith('module.bazel'),
    handler: (_, ctx) => ctx.addDirect('bazel', 92),
  },
  {
    test: (p) => p.endsWith('dockerfile') || p.endsWith('docker-compose.yml'),
    handler: detectFromDocker,
  },
  {
    test: (p) => p.includes('.github/workflows/') && /\.ya?ml$/.test(p),
    handler: detectFromGitHubWorkflow,
  },
  {
    test: (p) => p.endsWith('wrangler.jsonc') || p.endsWith('wrangler.toml'),
    handler: (_, ctx) => ctx.addDirect('cloudflare-workers', 95),
  },
  { test: (p) => p.endsWith('.tf'), handler: (_, ctx) => ctx.addDirect('terraform', 90) },
];

export function detectToolsFromManifest(path: string, content: string): ToolDetection[] {
  const lowerPath = path.toLowerCase();
  const detections: ToolDetection[] = [];
  const ctx: ManifestDetectContext = {
    addKnown: (name, confidence, source = path) => {
      const tool = knownTool(name);
      if (tool) detections.push(detection(tool, confidence, source));
    },
    addDirect: (key, confidence, source = path) => {
      const tool = knownTool(key);
      if (tool) detections.push(detection(tool, confidence, source));
    },
  };

  for (const route of manifestRoutes) {
    if (route.test(lowerPath)) {
      route.handler(content, ctx);
      break;
    }
  }

  return mergeToolDetections(detections);
}

const EXCLUDE_DIR_RE = /(^|\/)(node_modules|vendor|dist|build|target|coverage|\.next)\//;
const DOTNET_PROJECT_RE = /\.(csproj|fsproj|sln)$/;
const CONANFILE_RE = /(^|\/)conanfile\.(txt|py)$/;

const MANIFEST_SUFFIXES = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'pyproject.toml',
  'requirements.txt',
  'uv.lock',
  'poetry.lock',
  'cargo.toml',
  'cargo.lock',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'gemfile',
  'composer.json',
  'package.swift',
  'cmakelists.txt',
  'vcpkg.json',
  'meson.build',
  'workspace',
  'module.bazel',
  'dockerfile',
  'docker-compose.yml',
  'wrangler.jsonc',
  'wrangler.toml',
  '.tf',
];

export function isPotentialToolManifest(path: string): boolean {
  const lower = path.toLowerCase();
  if (EXCLUDE_DIR_RE.test(lower)) return false;
  if (DOTNET_PROJECT_RE.test(lower)) return true;
  if (CONANFILE_RE.test(lower)) return true;
  if (lower.includes('.github/workflows/')) return true;
  return MANIFEST_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}
