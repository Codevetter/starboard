#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const root = resolve(dirname(currentFile), '..');
const paths = [
  'src',
  'scripts',
  'landing-astro/src',
  'timing.mjs',
  'next.config.ts',
  'open-next.config.ts',
  'vitest.config.ts',
];
const baselines = {
  unused: {
    files: 0,
    exports: 0,
    types: 0,
    dependencies: 0,
    devDependencies: 0,
    unlisted: 0,
    unresolved: 0,
  },
  complexity: { violations: 34, maxCcn: 56, maxLength: 397, maxParams: 17 },
  duplication: {
    clones: 27,
    duplicatedLines: 369,
    percentage: 1.88,
  },
  suppressions: 8,
  dependencies: { critical: 0, highIds: 0, highFindings: 0 },
};

function output(message) {
  process.stdout.write(`${message}\n`);
}

function run(command, args, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result;
}

function json(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label} did not return JSON`, { cause: error });
  }
}

function regress(label, observed, baseline) {
  const failures = Object.entries(baseline).filter(([key, max]) => observed[key] > max);
  if (failures.length)
    throw new Error(
      failures.map(([key, max]) => `${label} ${key}: ${observed[key]} > ${max}`).join('\n')
    );
  if (Object.entries(baseline).some(([key, max]) => observed[key] < max))
    output(`${label} improved; lower the baseline intentionally.`);
}

function count(issues, key) {
  return issues.reduce((sum, issue) => sum + (issue[key]?.length ?? 0), 0);
}

function unused() {
  const issues =
    json(
      run('pnpm', ['exec', 'knip', '--reporter', 'json', '--no-exit-code', '--no-progress'], true),
      'Knip'
    ).issues ?? [];
  const observed = Object.fromEntries(
    Object.keys(baselines.unused).map((key) => [key, count(issues, key)])
  );
  output(
    `Unused: ${Object.entries(observed)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')}.`
  );
  regress('Unused', observed, baselines.unused);
}

function complexity() {
  const result = run('uvx', [
    '--from',
    'lizard==1.23.0',
    'lizard',
    ...paths,
    '-x',
    '**/*.test.*',
    '-x',
    '**/__tests__/**',
    '-x',
    'scripts/check-code-health.mjs',
    '-x',
    '**/*.d.ts',
    '--csv',
  ]);
  const rows = result.stdout
    .trim()
    .split('\n')
    .map((line) => line.match(/^(\d+),(\d+),(\d+),(\d+),(\d+),/u))
    .filter(Boolean)
    .map((match) => match.slice(1).map(Number));
  const observed = {
    functions: rows.length,
    nloc: rows.reduce((sum, row) => sum + row[0], 0),
    violations: rows.filter((row) => row[1] > 15 || row[4] > 100 || row[3] > 7).length,
    maxCcn: Math.max(0, ...rows.map((row) => row[1])),
    maxLength: Math.max(0, ...rows.map((row) => row[4])),
    maxParams: Math.max(0, ...rows.map((row) => row[3])),
  };
  output(
    `Complexity: ${observed.functions} functions, ${observed.nloc} NLOC, ${observed.violations} violations; max ${observed.maxCcn}/${observed.maxLength}/${observed.maxParams}.`
  );
  regress('Complexity', observed, baselines.complexity);
}

function duplication() {
  const outputDirectory = mkdtempSync(join(tmpdir(), 'starboard-jscpd-'));
  run('pnpm', [
    'exec',
    'jscpd',
    ...paths,
    '--min-lines',
    '8',
    '--min-tokens',
    '60',
    '--mode',
    'strict',
    '--ignore',
    '**/*.test.*,**/__tests__/**,**/*.d.ts,**/node_modules/**,**/dist/**,**/coverage/**,scripts/check-code-health.mjs',
    '--reporters',
    'json',
    '--output',
    outputDirectory,
    '--silent',
    '--no-tips',
  ]);
  const observed = JSON.parse(readFileSync(join(outputDirectory, 'jscpd-report.json'), 'utf8'))
    .statistics.total;
  output(
    `Duplication: ${observed.clones} groups, ${observed.duplicatedLines}/${observed.lines} lines (${observed.percentage.toFixed(4)}%).`
  );
  regress('Duplication', observed, baselines.duplication);
}

function cycles() {
  const issues =
    json(
      run(
        'pnpm',
        ['exec', 'knip', '--cycles', '--reporter', 'json', '--no-exit-code', '--no-progress'],
        true
      ),
      'Knip cycles'
    ).issues ?? [];
  const found = issues.flatMap((issue) => issue.cycles ?? []);
  if (found.length) throw new Error(`${found.length} dependency cycles detected.`);
  output('Cycles: zero JavaScript or TypeScript import cycles.');
}

function dependencies() {
  const advisories = Object.values(
    json(run('pnpm', ['audit', '--json'], true), 'pnpm audit').advisories ?? {}
  );
  const critical = advisories.filter((item) => item.severity === 'critical');
  const high = advisories.filter((item) => item.severity === 'high');
  const observed = {
    critical: critical.length,
    highIds: new Set(high.map((item) => item.github_advisory_id)).size,
    highFindings: high.reduce(
      (sum, item) => sum + item.findings.reduce((n, finding) => n + finding.paths.length, 0),
      0
    ),
  };
  output(
    `Dependencies: ${observed.critical} critical, ${observed.highIds} high IDs across ${observed.highFindings} paths.`
  );
  regress('Dependencies', observed, baselines.dependencies);
}

const suppression =
  /eslint-disable|@ts-ignore|@ts-expect-error|istanbul ignore|c8 ignore|(?:test|base)\.skip\(|\bTODO\b|\bFIXME\b/u;
const extensions = new Set(['.astro', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : entry.isFile() && extensions.has(extname(entry.name))
        ? [path]
        : [];
  });
}
function suppressions() {
  const sources = ['src', 'landing-astro/src'].flatMap((path) => files(resolve(root, path)));
  const found = sources.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => suppression.test(line))
  );
  output(`Suppressions: ${found.length} authored markers.`);
  if (found.length > baselines.suppressions)
    throw new Error(`Suppressions regressed: ${found.length} > ${baselines.suppressions}`);
}

function hygiene() {
  run('git', [
    'diff',
    '--check',
    'HEAD',
    '--',
    ...paths,
    '.github',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'knip.json',
    'biome.json',
    'tsconfig.json',
  ]);
  const conflicts = run('git', ['grep', '-nE', '^(<<<<<<< |=======|>>>>>>> )', '--', '.'], true);
  if (conflicts.status === 0) throw new Error(`Conflict markers found:\n${conflicts.stdout}`);
  const generated = run('git', ['ls-files', '--others', '--exclude-standard'])
    .stdout.trim()
    .split('\n')
    .filter(Boolean)
    .filter((file) =>
      /(^|\/)(coverage|dist|build|\.next|\.open-next|\.wrangler)(\/|$)|\.tsbuildinfo$/u.test(file)
    );
  if (generated.length) throw new Error(`Untracked generated files: ${generated.join(', ')}`);
  output('Repository hygiene passes.');
}

const checks = {
  unused,
  complexity,
  duplication,
  cycles,
  dependencies,
  suppressions,
  hygiene,
};
const selected = process.argv[2];
if (!Object.hasOwn(checks, selected)) process.exitCode = 2;
else
  try {
    checks[selected]();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
