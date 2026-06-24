import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  type FleetProjectMaturity,
  type FleetProjectSnapshot,
  inferFeatureAreas,
  topTokens,
} from '../src/lib/fleet-projects';

const fleetRoot = path.resolve(process.cwd(), '..');
const registryPath = path.join(fleetRoot, 'saas-maker', 'foundry.projects.json');
const outputPath = path.join(process.cwd(), 'data', 'fleet-projects.generated.json');
const outOfFleet = new Set(['personal-memory', 'port-whisperer', 'local-ai']);
const ignoredDirs = new Set([
  '.git',
  '.next',
  '.open-next',
  '.wrangler',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
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
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readText(filePath: string, maxChars = 8000): string {
  if (!existsSync(filePath)) return '';
  return readFileSync(filePath, 'utf8').slice(0, maxChars);
}

function stripMarkdown(text: string): string {
  return sanitizeSnapshotText(text)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`[\]()|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeSnapshotText(text: string): string {
  const sectionStop =
    /^(#{1,3}\s*)?(environment variables|environment|env|quick start|getting started|local development|google oauth setup|turso production|secrets?)\b/i;
  const sensitiveLine =
    /\b(secret|token|client[_\s-]?secret|client[_\s-]?id|database[_\s-]?url|auth[_\s-]?url|api[_\s-]?key|private key)\b/i;
  const kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (sectionStop.test(line.trim())) break;
    if (sensitiveLine.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n');
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
  return stripMarkdown(collected.join('\n')).slice(0, 1200);
}

function extractBullets(text: string, heading: string): string[] {
  const section = extractSection(text, heading);
  return section
    .split(/(?:\d+\.|\s-\s|•)/)
    .map((item) => item.trim())
    .filter((item) => item.length > 8)
    .slice(0, 8);
}

function findPackageJsons(root: string, maxDepth = 4): string[] {
  const results: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
        continue;
      }
      if (entry.name === 'package.json') {
        results.push(path.join(dir, entry.name));
      }
    }
  }
  if (existsSync(root)) walk(root, 0);
  return results;
}

function readPackageJson(filePath: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

function detectLanguages(projectRoot: string, packageFiles: string[]): string[] {
  const languages = new Set<string>();
  if (packageFiles.length > 0) languages.add('TypeScript');
  if (existsSync(path.join(projectRoot, 'Cargo.toml'))) languages.add('Rust');
  if (existsSync(path.join(projectRoot, 'go.mod'))) languages.add('Go');
  if (existsSync(path.join(projectRoot, 'pyproject.toml'))) languages.add('Python');
  if (existsSync(path.join(projectRoot, 'requirements.txt'))) languages.add('Python');
  return [...languages].sort();
}

function detectFrameworks(dependencies: string[]): string[] {
  const deps = new Set(dependencies);
  const frameworks: string[] = [];
  for (const [name, labels] of [
    ['next', ['Next.js']],
    ['react', ['React']],
    ['astro', ['Astro']],
    ['@opennextjs/cloudflare', ['OpenNext Cloudflare']],
    ['wrangler', ['Cloudflare Workers']],
    ['@libsql/client', ['Turso/libSQL']],
    ['drizzle-orm', ['Drizzle']],
    ['@radix-ui/react-dialog', ['Radix UI']],
    ['radix-ui', ['Radix UI']],
    ['tailwindcss', ['Tailwind CSS']],
    ['vitest', ['Vitest']],
    ['@playwright/test', ['Playwright']],
  ] as const) {
    if (deps.has(name)) frameworks.push(...labels);
  }
  return [...new Set(frameworks)].sort();
}

function detectConfigFiles(projectRoot: string): string[] {
  return [
    'next.config.ts',
    'vite.config.ts',
    'astro.config.mjs',
    'wrangler.jsonc',
    'wrangler.toml',
    'drizzle.config.ts',
    'tailwind.config.ts',
    'playwright.config.ts',
    'vitest.config.ts',
  ].filter((file) => existsSync(path.join(projectRoot, file)));
}

function normalizeMaturity(value: string | undefined): FleetProjectMaturity {
  if (value === 'public' || value === 'public-ready' || value === 'internal-first') {
    return value;
  }
  return 'internal-first';
}

function maturityRank(maturity: FleetProjectMaturity): number {
  if (maturity === 'public') return 0;
  if (maturity === 'public-ready') return 1;
  return 2;
}

function buildSnapshot(slug: string, entry: RegistryEntry): FleetProjectSnapshot | null {
  if (outOfFleet.has(slug)) return null;
  const projectRoot = path.join(fleetRoot, slug);
  if (!existsSync(projectRoot)) return null;

  const projectStatus = readText(path.join(projectRoot, 'PROJECT_STATUS.md'));
  const readme = readText(path.join(projectRoot, 'README.md'));
  const recommendationContext = stripMarkdown(
    readText(path.join(projectRoot, 'docs', 'PROJECT_RECOMMENDATION_CONTEXT.md'), 12000)
  ).slice(0, 5000);
  const packageFiles = findPackageJsons(projectRoot);
  const packages = packageFiles
    .map(readPackageJson)
    .filter((pkg): pkg is PackageJson => pkg !== null);
  const dependencies = [
    ...new Set(packages.flatMap((pkg) => Object.keys(pkg.dependencies ?? {}))),
  ].sort();
  const devDependencies = [
    ...new Set(packages.flatMap((pkg) => Object.keys(pkg.devDependencies ?? {}))),
  ].sort();
  const packageNames = [
    ...new Set(packages.map((pkg) => pkg.name).filter((name): name is string => Boolean(name))),
  ].sort();
  const statusSummary =
    extractSection(projectStatus, 'Current Scope') ||
    extractSection(projectStatus, 'Done') ||
    stripMarkdown(projectStatus).slice(0, 1200);
  const plannedNext = extractBullets(projectStatus, 'Planned Next');
  const deferred = extractBullets(projectStatus, 'Deferred / Parked');
  const readmeSummary = stripMarkdown(readme).slice(0, 1400);
  const contextText = [
    slug,
    entry.desc ?? '',
    statusSummary,
    plannedNext.join(' '),
    readmeSummary,
    recommendationContext,
    dependencies.join(' '),
    devDependencies.join(' '),
  ].join('\n');
  const featureAreas = inferFeatureAreas({
    description: entry.desc ?? '',
    statusSummary,
    plannedNext,
    readmeSummary,
    recommendationContext,
    dependencies: [...dependencies, ...devDependencies],
  });

  return {
    slug,
    name: slug,
    description: entry.desc ?? '',
    url: entry.url ?? '',
    tier: entry.tier ?? 'unknown',
    category: entry.category ?? 'unknown',
    priority: entry.priority ?? 'unknown',
    maturity: normalizeMaturity(entry.maturity),
    sourcePath: path.relative(fleetRoot, projectRoot),
    statusSummary,
    plannedNext,
    deferred,
    readmeSummary,
    recommendationContext,
    featureAreas,
    stack: {
      dependencies,
      devDependencies,
      packageNames,
      languages: detectLanguages(projectRoot, packageFiles),
      frameworks: detectFrameworks([...dependencies, ...devDependencies]),
      configFiles: detectConfigFiles(projectRoot),
    },
    contextText: [
      contextText,
      topTokens(contextText, 40).join(' '),
      featureAreas.flatMap((feature) => feature.keywords).join(' '),
    ].join('\n'),
  };
}

function main() {
  const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as Record<string, RegistryEntry>;
  const projects = Object.entries(registry)
    .map(([slug, entry]) => buildSnapshot(slug, entry))
    .filter((project): project is FleetProjectSnapshot => project !== null)
    .sort((a, b) => {
      const maturity = maturityRank(a.maturity) - maturityRank(b.maturity);
      if (maturity !== 0) return maturity;
      return a.slug.localeCompare(b.slug);
    });

  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: path.relative(process.cwd(), registryPath),
        projects,
      },
      null,
      2
    )}\n`
  );

  console.info(
    `Wrote ${projects.length} fleet projects to ${path.relative(process.cwd(), outputPath)}`
  );
}

main();
