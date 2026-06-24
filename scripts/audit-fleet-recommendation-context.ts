import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { inferFeatureAreas, topTokens } from '../src/lib/fleet-projects';

const fleetRoot = path.resolve(process.cwd(), '..');
const registryPath = path.join(fleetRoot, 'saas-maker', 'foundry.projects.json');
const outOfFleet = new Set(['personal-memory', 'port-whisperer', 'local-ai']);
const ignoredDirs = new Set([
  '.claude',
  '.build',
  '.git',
  '.next',
  '.open-next',
  '.symphony',
  '.turbo',
  '.venv',
  '.wrangler',
  '.xcode-build',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'playwright-report',
  'target',
  'test-results',
  'vendor',
]);
const binaryExts = new Set([
  '.7z',
  '.a',
  '.bin',
  '.bmp',
  '.bz2',
  '.dylib',
  '.eot',
  '.exe',
  '.flac',
  '.gif',
  '.gz',
  '.ico',
  '.icns',
  '.jpeg',
  '.jpg',
  '.lib',
  '.mov',
  '.mp3',
  '.mp4',
  '.o',
  '.ogg',
  '.otf',
  '.pdf',
  '.png',
  '.psd',
  '.rar',
  '.so',
  '.tar',
  '.tgz',
  '.tiff',
  '.ttf',
  '.wasm',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.xz',
  '.zip',
]);

interface RegistryEntry {
  desc?: string;
  url?: string;
  tier?: string;
  category?: string;
  priority?: string;
  maturity?: string;
}

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface RepoAudit {
  slug: string;
  entry: RegistryEntry;
  root: string;
  files: string[];
  packageFiles: string[];
  packages: PackageJson[];
  statusText: string;
  readmeText: string;
  agentText: string;
  docs: string[];
  configFiles: string[];
  entrypoints: string[];
  tests: string[];
  scripts: string[];
  dependencies: string[];
  devDependencies: string[];
  languages: string[];
  frameworks: string[];
}

function readText(filePath: string, maxChars = 12000): string {
  if (!existsSync(filePath)) return '';
  return sanitizeSnapshotText(readFileSync(filePath, 'utf8')).slice(0, maxChars);
}

function sanitizeSnapshotText(text: string): string {
  const sectionStop =
    /^(#{1,3}\s*)?(environment variables|environment|env|quick start|getting started|local development|oauth|secrets?)\b/i;
  const sensitiveLine =
    /\b(secret|token|client[_\s-]?secret|client[_\s-]?id|database[_\s-]?url|auth[_\s-]?url|api[_\s-]?key|private key|password)\b/i;
  const kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (sectionStop.test(line.trim())) break;
    if (sensitiveLine.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

function stripMarkdown(text: string): string {
  return sanitizeSnapshotText(text)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`[\]()|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSection(text: string, heading: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    new RegExp(`^##\\s+${heading}\\s*$`, 'i').test(line.trim())
  );
  if (start < 0) return '';
  const collected: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    collected.push(lines[i]);
  }
  return stripMarkdown(collected.join('\n')).slice(0, 1400);
}

function walkFiles(root: string, maxDepth = 5): string[] {
  const results: string[] = [];
  function walk(dir: string, depth: number) {
    if (results.length >= 4500 || depth > maxDepth) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath);
      const ext = path.extname(entry.name).toLowerCase();
      if (binaryExts.has(ext) || entry.name.endsWith('.lock')) continue;
      if (statSync(fullPath).size > 1_000_000) continue;
      results.push(relPath);
    }
  }
  if (existsSync(root)) walk(root, 0);
  return results.sort();
}

function readPackage(filePath: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

function detectLanguages(files: string[]): string[] {
  const languageByExt: Record<string, string> = {
    '.astro': 'Astro',
    '.go': 'Go',
    '.py': 'Python',
    '.rs': 'Rust',
    '.swift': 'Swift',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
  };
  return [
    ...new Set(files.map((file) => languageByExt[path.extname(file)]).filter(Boolean)),
  ].sort();
}

function detectFrameworks(dependencies: string[], files: string[]): string[] {
  const deps = new Set(dependencies);
  const frameworks: string[] = [];
  for (const [name, label] of [
    ['@opennextjs/cloudflare', 'OpenNext Cloudflare'],
    ['@playwright/test', 'Playwright'],
    ['@radix-ui/react-dialog', 'Radix UI'],
    ['@tauri-apps/api', 'Tauri'],
    ['astro', 'Astro'],
    ['drizzle-orm', 'Drizzle'],
    ['next', 'Next.js'],
    ['react', 'React'],
    ['tailwindcss', 'Tailwind CSS'],
    ['vitest', 'Vitest'],
    ['wrangler', 'Cloudflare Workers'],
  ] as const) {
    if (deps.has(name)) frameworks.push(label);
  }
  if (files.some((file) => file.endsWith('Cargo.toml'))) frameworks.push('Cargo');
  if (files.some((file) => file.endsWith('go.mod'))) frameworks.push('Go modules');
  if (files.some((file) => file.endsWith('Package.swift')))
    frameworks.push('Swift Package Manager');
  return [...new Set(frameworks)].sort();
}

function selectDocs(files: string[]): string[] {
  return files
    .filter((file) =>
      /(^README\.md$|^PROJECT_STATUS\.md$|^AGENTS\.md$|^agents\.md$|^docs\/[^/]+\.md$|^HANDOFF\.md$|^SPEC\.md$)/i.test(
        file
      )
    )
    .filter((file) => !file.includes('PROJECT_RECOMMENDATION_CONTEXT.md'))
    .slice(0, 28);
}

function selectConfigFiles(files: string[]): string[] {
  return files
    .filter((file) =>
      /(^|\/)(next\.config|vite\.config|astro\.config|wrangler\.(jsonc|toml)|drizzle\.config|tailwind\.config|playwright\.config|vitest\.config|Cargo\.toml|go\.mod|pyproject\.toml|Package\.swift|tauri\.conf\.json)/.test(
        file
      )
    )
    .slice(0, 32);
}

function selectEntrypoints(files: string[]): string[] {
  return files
    .filter((file) => !/(__tests__|tests?\/|\.test\.|\.spec\.)/.test(file))
    .filter((file) =>
      /(^src\/app\/.*(page|layout|route)\.(ts|tsx)$|^app\/.*(page|layout|route)\.(ts|tsx)$|^apps\/[^/]+\/src\/app\/.*(page|layout|route)\.(ts|tsx)$|^src\/pages\/|^apps\/[^/]+\/src\/pages\/|^src\/routes\/|^src-tauri\/src\/(main|lib)\.rs$|^src-tauri\/src\/commands\/|^src\/(main|index|App)\.(ts|tsx|rs)$|^worker\.mjs$|^workers\/[^/]+\/src\/index\.ts$|^workers\/[^/]+\/src\/routes\/|^browser\/src\/pages\/|^native-mac\/Sources\/)/.test(
        file
      )
    )
    .slice(0, 42);
}

function selectTests(files: string[]): string[] {
  return files
    .filter((file) =>
      /(__tests__|tests?\/|\.test\.|\.spec\.|playwright\.config|vitest\.config)/.test(file)
    )
    .slice(0, 42);
}

function auditProject(slug: string, entry: RegistryEntry): RepoAudit | null {
  if (outOfFleet.has(slug)) return null;
  const root = path.join(fleetRoot, slug);
  if (!existsSync(root)) return null;
  const files = walkFiles(root);
  const packageFiles = files.filter((file) => file.endsWith('package.json'));
  const packages = packageFiles
    .map((file) => readPackage(path.join(root, file)))
    .filter((pkg): pkg is PackageJson => Boolean(pkg));
  const dependencies = [
    ...new Set(packages.flatMap((pkg) => Object.keys(pkg.dependencies ?? {}))),
  ].sort();
  const devDependencies = [
    ...new Set(packages.flatMap((pkg) => Object.keys(pkg.devDependencies ?? {}))),
  ].sort();
  const scripts = [...new Set(packages.flatMap((pkg) => Object.keys(pkg.scripts ?? {})))].sort();

  return {
    slug,
    entry,
    root,
    files,
    packageFiles,
    packages,
    statusText: readText(path.join(root, 'PROJECT_STATUS.md')),
    readmeText: readText(path.join(root, 'README.md')),
    agentText: readText(path.join(root, 'AGENTS.md')) || readText(path.join(root, 'agents.md')),
    docs: selectDocs(files),
    configFiles: selectConfigFiles(files),
    entrypoints: selectEntrypoints(files),
    tests: selectTests(files),
    scripts,
    dependencies,
    devDependencies,
    languages: detectLanguages(files),
    frameworks: detectFrameworks([...dependencies, ...devDependencies], files),
  };
}

function confidence(audit: RepoAudit): { level: string; reasons: string[] } {
  const reasons: string[] = [];
  if (audit.statusText) reasons.push('PROJECT_STATUS.md present');
  if (audit.readmeText) reasons.push('README.md present');
  if (audit.entrypoints.length >= 3)
    reasons.push(`${audit.entrypoints.length} entrypoint/runtime files identified`);
  if (audit.dependencies.length + audit.devDependencies.length > 0)
    reasons.push('package dependencies inventoried');
  if (audit.tests.length > 0) reasons.push(`${audit.tests.length} test/quality files identified`);

  if (
    audit.statusText &&
    audit.readmeText &&
    audit.entrypoints.length >= 3 &&
    audit.tests.length > 0
  ) {
    return { level: 'high', reasons };
  }
  if ((audit.statusText || audit.readmeText) && audit.entrypoints.length > 0) {
    return { level: 'medium', reasons };
  }
  return {
    level: 'needs review',
    reasons: reasons.length > 0 ? reasons : ['limited local evidence found by the scanner'],
  };
}

function bulletList(values: string[], empty = '- Not detected in this pass.'): string {
  if (values.length === 0) return empty;
  return values.map((value) => `- \`${value}\``).join('\n');
}

function plainBulletList(values: string[], empty = '- Not detected in this pass.'): string {
  if (values.length === 0) return empty;
  return values.map((value) => `- ${value}`).join('\n');
}

function summarizePurpose(audit: RepoAudit): string {
  const statusScope =
    extractSection(audit.statusText, 'Current Scope') ||
    extractSection(audit.statusText, 'Done') ||
    stripMarkdown(audit.statusText).slice(0, 700);
  const readme = stripMarkdown(audit.readmeText).slice(0, 700);
  return [audit.entry.desc ?? '', statusScope, readme].filter(Boolean).join('\n\n').slice(0, 1800);
}

function goodMatchGuidance(audit: RepoAudit, featureLabels: string[]): string[] {
  const tokens = topTokens(
    [
      audit.entry.desc ?? '',
      audit.statusText,
      audit.readmeText,
      audit.entrypoints.join(' '),
      audit.dependencies.join(' '),
    ].join('\n'),
    18
  );
  return [
    ...featureLabels.map(
      (label) =>
        `Repos that strengthen ${label.toLowerCase()} without replacing already-installed libraries.`
    ),
    `Tools with concrete support for ${tokens.slice(0, 8).join(', ')}.`,
    'Implementation repos, SDKs, CLIs, testing utilities, adapters, and focused libraries are higher value than generic awesome lists.',
  ].slice(0, 10);
}

function renderDoc(audit: RepoAudit): string {
  const purpose = summarizePurpose(audit);
  const features = inferFeatureAreas({
    description: audit.entry.desc ?? '',
    statusSummary: audit.statusText,
    plannedNext: [],
    readmeSummary: audit.readmeText,
    dependencies: [...audit.dependencies, ...audit.devDependencies],
  });
  const confidenceResult = confidence(audit);
  const generatedAt = new Date().toISOString();
  const featureLines = features.map(
    (feature) =>
      `**${feature.label}**: ${feature.description} Keywords: ${feature.keywords.slice(0, 8).join(', ')}.`
  );
  const dependencyList = audit.dependencies.slice(0, 80);
  const devDependencyList = audit.devDependencies.slice(0, 60);
  const avoid = [
    'Do not recommend packages already listed under direct or development dependencies unless the task is migration research.',
    'Do not recommend broad framework replacements unless the project context explicitly calls for a rewrite.',
    'Downrank curated lists, archived repos, stale demos, and generic UI kits that do not map to the feature catalog.',
  ];

  return `# Project Recommendation Context

Generated: ${generatedAt}

This file is a CodeVetter Repo Unpacked-inspired audit written for Starboard recommendations. It is intentionally local, evidence-oriented, and safe to commit: it records product context, feature areas, stack inventory, and recommendation guidance without secrets or environment values.

## Project Identity

- Slug: \`${audit.slug}\`
- Registry description: ${audit.entry.desc || 'Not provided.'}
- Product grouping: \`${audit.entry.maturity ?? 'internal-first'}\`
- Source path: \`${path.relative(fleetRoot, audit.root)}\`

## Product Context

${purpose || 'The scanner did not find enough prose documentation to summarize the product confidently.'}

## Feature Map

${plainBulletList(featureLines)}

## Runtime Surfaces and Entrypoints

${bulletList(audit.entrypoints)}

## Current Stack

- Languages: ${audit.languages.length > 0 ? audit.languages.map((item) => `\`${item}\``).join(', ') : 'not detected'}
- Frameworks/tools: ${audit.frameworks.length > 0 ? audit.frameworks.map((item) => `\`${item}\``).join(', ') : 'not detected'}
- Config files:
${bulletList(audit.configFiles)}

## OSS Already In Use

Direct dependencies:
${bulletList(dependencyList)}

Development dependencies:
${bulletList(devDependencyList)}

Package scripts:
${bulletList(audit.scripts.slice(0, 80))}

## Testing and Quality Signals

${bulletList(audit.tests)}

## Recommendation Guidance

Good matches:
${plainBulletList(
  goodMatchGuidance(
    audit,
    features.map((feature) => feature.label)
  )
)}

Avoid recommending:
${plainBulletList(avoid)}

## Evidence Read

Primary docs and handoff files:
${bulletList(audit.docs)}

Package manifests:
${bulletList(audit.packageFiles)}

Inventory notes:
- Files scanned: ${audit.files.length}
- This pass uses deterministic repo inventory plus local documentation/source-path evidence. It does not claim a full manual line-by-line review of every source file.

## Confidence

Confidence: **${confidenceResult.level}**

Why:
${plainBulletList(confidenceResult.reasons)}

Refresh command:

\`\`\`bash
cd /Users/sarthak/Desktop/fleet/starboard
pnpm fleet:audit-recommendation-context
pnpm fleet:extract-projects
\`\`\`
`;
}

function main() {
  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as Record<string, RegistryEntry>;
  const audited: string[] = [];
  for (const [slug, entry] of Object.entries(registry)) {
    const audit = auditProject(slug, entry);
    if (!audit) continue;
    const docsDir = path.join(audit.root, 'docs');
    mkdirSync(docsDir, { recursive: true });
    const outputPath = path.join(docsDir, 'PROJECT_RECOMMENDATION_CONTEXT.md');
    writeFileSync(outputPath, renderDoc(audit));
    audited.push(slug);
  }
  console.info(`Wrote Starboard recommendation context docs for ${audited.length} projects.`);
}

main();
