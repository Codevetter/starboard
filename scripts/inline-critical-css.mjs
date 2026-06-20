import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import Beasties from 'beasties';

const DEFAULT_PRERENDERED_ROOTS = [
  '.next/server/app',
  '.next/standalone/.next/server/app',
  '.next/standalone/apps/web/.next/server/app',
];

async function walkHtml(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const st = await stat(full);
    if (st.isDirectory()) {
      out.push(...(await walkHtml(full)));
    } else if (entry.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function deRenderBlockCss(html) {
  return html.replace(
    /<link rel="stylesheet" href="([^"]+\.css)"[^>]*\/?>(?!<\/noscript>)/g,
    (match, href) => {
      const preloadPattern = new RegExp(
        `<link rel="preload" href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*onload=`,
      );
      return preloadPattern.test(html) ? '' : match;
    },
  );
}

export async function runInlineCss(opts = {}) {
  const strict = opts.strict ?? false;
  const staticRoot = resolve('.next');
  const prerenderedRoots = DEFAULT_PRERENDERED_ROOTS.map((p) => resolve(p)).filter((p) =>
    existsSync(p),
  );

  const htmls = [];
  for (const root of prerenderedRoots) {
    htmls.push(...(await walkHtml(root)));
  }
  if (htmls.length === 0) {
    const msg = '[inline-critical-css] no .html files under .next/server/app — skipping';
    if (strict) {
      console.error(msg);
      process.exit(1);
    }
    console.log(msg);
    return;
  }

  const beasties = new Beasties({
    path: staticRoot,
    publicPath: '/_next/',
    preload: 'swap',
    inlineFonts: false,
    pruneSource: false,
    logLevel: 'warn',
  });

  let total = 0;
  let saved = 0;
  for (const file of htmls) {
    const before = await readFile(file, 'utf8');
    let after;
    try {
      after = await beasties.process(before);
    } catch (err) {
      console.warn(`[inline-critical-css] skipping ${file}: ${err.message}`);
      continue;
    }
    after = deRenderBlockCss(after);
    if (after === before) continue;
    await writeFile(file, after);
    const delta = before.length - after.length;
    total += 1;
    saved += delta;
    const rel = file.replace(`${process.cwd()}/`, '');
    console.log(
      `[inline-critical-css] ${rel}: ${(before.length / 1024).toFixed(1)}KB → ${(after.length / 1024).toFixed(1)}KB`,
    );
  }

  console.log(
    `[inline-critical-css] done — processed ${total} file(s), net size change ${(saved / 1024).toFixed(1)}KB`,
  );
}
