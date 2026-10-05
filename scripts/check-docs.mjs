#!/usr/bin/env node
// Validate docs/ link integrity and structure for the Starboard repository.
//
// What it checks:
//   1. Every Markdown link in docs/, AGENTS.md, STATUS.md, PROJECT_STATUS.md,
//      README.md points at a file that exists (relative links only; absolute
//      http(s) links and mailto: are skipped).
//   2. Every .md file under docs/ is reachable from docs/index.md via at
//      least one in-repo link (orphan check). Archive files are exempt
//      because they are linked from docs/archive/index.md.
//   3. Required top-level docs exist (index.md, product/overview.md,
//      architecture/overview.md, knowledge/learnings.md, archive/index.md).
//   4. No stray files outside the canonical docs/ structure (anything not
//      under the known top-level folders is reported).
//
// Exit codes: 0 = clean, 1 = violations found, 2 = misconfiguration.
//
// Run: pnpm docs:check  OR  node scripts/check-docs.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DOCS = join(ROOT, 'docs');

const CANONICAL_TOP_LEVEL_DIRS = new Set([
  'archive',
  'architecture',
  'development',
  'knowledge',
  'marketing',
  'operations',
  'product',
]);

const REQUIRED_FILES = [
  'docs/index.md',
  'docs/product/overview.md',
  'docs/architecture/overview.md',
  'docs/knowledge/learnings.md',
  'docs/archive/index.md',
  'AGENTS.md',
  'STATUS.md',
];

const ROOT_FILES_SCANNED_FOR_LINKS = ['AGENTS.md', 'STATUS.md', 'PROJECT_STATUS.md', 'README.md'];

// Markdown link regex: [text](target)
// Captures the target. Skips code spans inlined in text naively.
const LINK_RE = /(?<!\\)\[(?:[^\]\\]|\\.)*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function walkMd(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      out.push(...walkMd(full));
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function listAllMdFiles() {
  const docsFiles = walkMd(DOCS);
  const rootFiles = ROOT_FILES_SCANNED_FOR_LINKS.map((f) => join(ROOT, f)).filter((f) =>
    existsSync(f)
  );
  return [...docsFiles, ...rootFiles];
}

function extractLinks(text) {
  const links = [];
  LINK_RE.lastIndex = 0;
  let m = LINK_RE.exec(text);
  while (m !== null) {
    links.push(m[1]);
    m = LINK_RE.exec(text);
  }
  return links;
}

function resolveLinkTarget(fromFile, target) {
  // Strip anchor.
  const hashIdx = target.indexOf('#');
  const path = hashIdx >= 0 ? target.slice(0, hashIdx) : target;
  if (!path) return null; // pure anchor link — assume same page, skip
  // Absolute URL or protocol.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  if (path.startsWith('//')) return null;
  // Mailto / tel.
  if (/^(mailto|tel):/i.test(path)) return null;
  // Resolve relative to the file's directory.
  const baseDir = dirname(fromFile);
  const resolved = resolve(baseDir, path);
  return resolved;
}

function findBrokenLinks(files) {
  const broken = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const target of extractLinks(text)) {
      const resolved = resolveLinkTarget(file, target);
      if (!resolved) continue;
      if (!existsSync(resolved)) {
        broken.push({ file: relative(ROOT, file), target, resolved: relative(ROOT, resolved) });
      }
    }
  }
  return broken;
}

function findOrphans(allDocsFiles) {
  // Build a set of all files linked from anywhere in docs/ + the root files.
  const linkedTargets = new Set();
  for (const file of allDocsFiles) {
    const text = readFileSync(file, 'utf8');
    for (const target of extractLinks(text)) {
      const resolved = resolveLinkTarget(file, target);
      if (resolved && existsSync(resolved)) {
        linkedTargets.add(resolved);
      }
    }
  }
  // A docs file is an orphan if no link points at it AND it is not an
  // index.md (index files are directory roots, conventionally linked by
  // their parent folder path).
  const orphans = [];
  for (const file of allDocsFiles) {
    if (file.endsWith(join('docs', 'index.md'))) continue; // docs root
    if (linkedTargets.has(file)) continue;
    // Allow index.md files to be linked via their directory (e.g. `docs/archive/`).
    const dir = dirname(file);
    if (file.endsWith(`${sep}index.md`) && linkedTargets.has(dir)) continue;
    orphans.push(relative(ROOT, file));
  }
  return orphans;
}

function findStrayFiles() {
  const stray = [];
  for (const entry of readdirSync(DOCS, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!CANONICAL_TOP_LEVEL_DIRS.has(entry.name)) {
        stray.push(`docs/${entry.name}/ (unknown top-level dir)`);
      }
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      // Files directly under docs/ (other than index.md) are non-canonical.
      if (entry.name !== 'index.md') {
        stray.push(`docs/${entry.name} (file directly under docs/)`);
      }
    }
  }
  return stray;
}

function findMissingRequired() {
  return REQUIRED_FILES.filter((f) => !existsSync(join(ROOT, f)));
}

function main() {
  const errors = [];
  const warnings = [];

  const missing = findMissingRequired();
  for (const f of missing) errors.push(`Missing required file: ${f}`);

  const stray = findStrayFiles();
  for (const s of stray) warnings.push(`Stray path: ${s}`);

  const allFiles = listAllMdFiles();
  const broken = findBrokenLinks(allFiles);
  for (const b of broken) {
    errors.push(`Broken link in ${b.file}: \`${b.target}\` → ${b.resolved} (not found)`);
  }

  const docsFiles = walkMd(DOCS);
  const orphans = findOrphans([
    ...docsFiles,
    ...ROOT_FILES_SCANNED_FOR_LINKS.map((f) => join(ROOT, f)).filter((f) => existsSync(f)),
  ]);
  for (const o of orphans) {
    warnings.push(`Orphan doc (no inbound link): ${o}`);
  }

  console.log('docs:check — validating documentation links and structure\n');

  if (errors.length > 0) {
    console.error(`Errors (${errors.length}):`);
    for (const e of errors) console.error(`  ✖ ${e}`);
    console.error();
  }

  if (warnings.length > 0) {
    console.warn(`Warnings (${warnings.length}):`);
    for (const w of warnings) console.warn(`  ⚠ ${w}`);
    console.warn();
  }

  const checkedCount = allFiles.length;
  if (errors.length === 0) {
    console.log(
      `✓ ${checkedCount} Markdown file(s) checked — no broken links or missing required files.`
    );
  }

  if (warnings.length > 0) {
    console.log(`  ${warnings.length} warning(s) (orphans / stray paths).`);
  }

  if (errors.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
