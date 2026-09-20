#!/usr/bin/env node
// Convert SEO article drafts from marketing/articles/starboard/ into
// landing-astro article pages at src/pages/articles/.
//
// Usage: node landing-astro/scripts/sync-articles.mjs <drafts-dir>
//
// <drafts-dir> contains flat *.md files with marketing-draft frontmatter
// (title, slug, target_query, search_intent, meta_title, meta_description)
// and working sections (Outline, Internal-Link Suggestions, Source Notes)
// that must never be published. Output files use the Article layout contract
// (title, description, date, author, readingMinutes).

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const [draftsDir] = process.argv.slice(2);
if (!draftsDir) {
  console.error('usage: node landing-astro/scripts/sync-articles.mjs <drafts-dir>');
  process.exit(1);
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEADING = /^#{1,4} /;
const SKIP_HEADING = /^(outline|internal[- ]link\w*|source notes)\b/i;
const INLINE_NOTE = /\*?\[Internal Link Suggestions?:[^\]]*\]\*?/gi;
const today = new Date().toISOString().slice(0, 10);
const outDir = new URL('../src/pages/articles/', import.meta.url).pathname;

const parseFrontmatter = (raw) => {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error('missing frontmatter');
  const data = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) data[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return { data, body: match[2] };
};

const stripWorkingSections = (body) => {
  const kept = [];
  // skip = false | "heading" | "outline" — a `**Outline:**` block ends at `---`,
  // a skipped heading section ends at the next heading.
  let skip = false;
  for (const line of body.split('\n')) {
    if (/^# /.test(line)) {
      skip = false;
      continue;
    } // drafts may carry an h1; the layout renders its own
    if (HEADING.test(line)) {
      skip = SKIP_HEADING.test(line.replace(/^#+\s*/, '').replace(/^[[*]+\s*/, ''))
        ? 'heading'
        : false;
      if (!skip) kept.push(line);
      continue;
    }
    if (!skip && /^\*\*Outline:?\*\*/.test(line.trim())) {
      skip = 'outline';
      continue;
    }
    if (line.trim() === '---') {
      if (skip === 'outline') skip = false;
      continue;
    }
    if (!skip) kept.push(line);
  }
  return kept
    .join('\n')
    .replace(INLINE_NOTE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const yamlString = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

mkdirSync(outDir, { recursive: true });
let count = 0;
for (const file of readdirSync(draftsDir)
  .filter((f) => f.endsWith('.md'))
  .sort()) {
  const { data, body } = parseFrontmatter(readFileSync(join(draftsDir, file), 'utf8'));
  const slug = (data.slug || basename(file, '.md')).split('/').filter(Boolean).pop();
  if (!data.title?.trim()) throw new Error(`${file}: missing title`);
  if (!data.meta_description?.trim()) throw new Error(`${file}: missing meta_description`);
  if (!SLUG.test(slug)) throw new Error(`${file}: bad slug ${slug}`);
  const clean = stripWorkingSections(body);
  if (!clean) throw new Error(`${file}: empty body after stripping working sections`);
  const readingMinutes = Math.max(1, Math.ceil(clean.split(/\s+/).length / 220));
  const out = [
    '---',
    'layout: ../../layouts/Article.astro',
    `title: ${yamlString(data.title)}`,
    `description: ${yamlString(data.meta_description)}`,
    `date: "${today}"`,
    'author: "Sarthak Agrawal"',
    `readingMinutes: ${readingMinutes}`,
    '---',
    '',
    clean,
    '',
  ].join('\n');
  writeFileSync(join(outDir, `${slug}.md`), out);
  count++;
}
console.log(`Synced ${count} article(s) into landing-astro/src/pages/articles/`);
