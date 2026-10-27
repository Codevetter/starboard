import fs from 'node:fs';
import vm from 'node:vm';
import { absoluteMarkdownLinks } from '../src/edge/agent-surfaces/format.mjs';
const origin = 'https://starboard.codevetter.com';
const home = JSON.parse(fs.readFileSync('landing-astro/src/content/home.json', 'utf8'));
const pages = {};
const routes = [];
function add(path, title, description, body) {
  const canonical = origin + path;
  pages[path] = absoluteMarkdownLinks(
    `# ${title}\n\n> ${description}\n\nCanonical: ${canonical}\n\n${body}\n`,
    canonical
  );
  routes.push({ path, title, description });
}
const link = (value) => (value ? `[${value.label}](${new URL(value.href, origin).href})` : '');
const picture = (value) =>
  value
    ? `![${value.alt}](${new URL(value.src.startsWith('/') ? value.src : `/images/${value.src}`, origin).href})`
    : '';
function block(value) {
  switch (value.type) {
    case 'spread':
      return value.items
        .map(
          (item) => `## ${item.title}\n\n${item.kicker}\n\n${item.body}\n\n${picture(item.detail)}`
        )
        .join('\n\n');
    case 'statement':
      return `## ${value.title}\n\n${value.lede}`;
    case 'faq':
      return `## ${value.title}\n\n${value.lede}\n\n${value.items.map((item) => `### ${item.q}\n\n${item.a}`).join('\n\n')}`;
    case 'cta':
      return `## ${value.title}\n\n${value.lede}\n\n${link(value.primary)}\n\n${link(value.secondary)}`;
    default:
      throw new Error(`Missing Workbench source block: ${value.type}`);
  }
}
add(
  '/',
  home.page.title,
  home.page.description,
  [
    home.hero.eyebrow,
    `## ${home.hero.title}`,
    home.hero.lede,
    home.hero.form.label,
    home.hero.form.hint,
    link(home.hero.secondary),
    picture(home.hero.card),
    ...home.sections.flatMap((section) => section.blocks.map(block)),
  ].join('\n\n')
);
// Read the authored TypeScript declaration, never built HTML.
const changelog = fs.readFileSync('landing-astro/src/pages/changelog.astro', 'utf8');
const match = changelog.match(/const entries = ([\s\S]*?) as const;/);
if (!match) throw new Error('Missing authored changelog entries');
const entries = vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
const copy = JSON.parse(fs.readFileSync('landing-astro/src/content/changelog-copy.json', 'utf8'));
add(
  '/changelog',
  'Starboard changelog — shipped improvements',
  'Verified, user-visible improvements shipped by Starboard.',
  `## ${copy.heading}\n\n${copy.intro} [${copy.link}](${origin}/catalog-updates)${copy.after}\n\n${entries
    .map((e) => `## ${e.date}: ${e.title}\n\n${e.outcomes.map((o) => `- ${o}`).join('\n')}`)
    .join('\n\n')}`
);
const articles = [];
for (const file of fs
  .readdirSync('landing-astro/src/pages/articles')
  .filter((f) => f.endsWith('.md'))) {
  const raw = fs.readFileSync(`landing-astro/src/pages/articles/${file}`, 'utf8');
  const front = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!front) throw new Error(`Missing frontmatter ${file}`);
  const meta = {};
  for (const key of ['title', 'description', 'date']) {
    const value = front[1].match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1];
    if (!value) throw new Error(`Missing ${key} ${file}`);
    meta[key] = JSON.parse(value);
  }
  const path = `/articles/${file.slice(0, -3)}`;
  add(path, meta.title, meta.description, raw.slice(front[0].length).trim());
  articles.push({ ...meta, path });
}
articles.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
add(
  '/articles',
  'Starboard articles',
  'Guides on evaluating GitHub repositories, reading tool signals, and choosing open-source dependencies.',
  articles.map((a) => `- [${a.title}](${origin + a.path}): ${a.description}`).join('\n')
);
fs.writeFileSync(
  'src/edge/public-static.mjs',
  `// Generated from authored home.json, changelog data, and article Markdown.\nexport const STATIC_PAGES = ${JSON.stringify(pages)};\nexport const STATIC_ROUTES = ${JSON.stringify(routes)};\n`
);
console.log(`Generated ${routes.length} source-based static Markdown pages.`);
