#!/usr/bin/env node
// inline-critical-css.mjs — runs Beasties over Next.js prerendered HTML
// to inline above-fold CSS and lazy-load the rest.
//
// psi-swarm flagged a 142 KB Tailwind v4 stylesheet as the top render-
// blocker on karte.cc /. Beasties scans each HTML's stylesheets, picks
// only the rules actually used by elements in that HTML, inlines them
// into <head>, and rewrites the original <link rel="stylesheet"> to
// load asynchronously (rel="preload" + onload swap).
//
// Runs between `next build` and `opennextjs-cloudflare build` so the
// modified HTML lands in the assets the Worker serves.
//
// Safe by construction: Beasties only removes <link rel="stylesheet">
// if it has successfully extracted the critical subset and added the
// async-load fallback. Worst case: the file is left as-is.

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import Beasties from "beasties";

// Next.js writes prerendered HTML to two places when output: 'standalone'
// is active (the OpenNext build relies on this):
//   - .next/server/app/<route>.html
//   - .next/standalone/.next/server/app/<route>.html
// The OpenNext bundler reads from the standalone copy, so Beasties must
// process both — modifying only the first leaves the deployed Worker
// serving the original render-blocking HTML.
const PRERENDERED_ROOTS = [
  resolve(".next/server/app"),
  resolve(".next/standalone/.next/server/app"),
].filter((p) => existsSync(p));
const STATIC_ROOT = resolve(".next");

async function walkHtml(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const st = await stat(full);
    if (st.isDirectory()) {
      out.push(...(await walkHtml(full)));
    } else if (entry.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const htmls = [];
  for (const root of PRERENDERED_ROOTS) {
    htmls.push(...(await walkHtml(root)));
  }
  if (htmls.length === 0) {
    console.log("[inline-critical-css] no .html files under .next/server/app — skipping");
    return;
  }

  const beasties = new Beasties({
    // Where Beasties resolves stylesheet hrefs against. Maps the
    // public `/_next/static/...` prefix back to `.next/static/...`.
    path: STATIC_ROOT,
    publicPath: "/_next/",
    // `swap` rewrites <link rel="stylesheet"> to preload + onload swap
    // so the leftover (non-critical) CSS loads without blocking paint.
    preload: "swap",
    // Don't inline web fonts via <style> — they're cross-origin and
    // would re-introduce blocking time. Browser's own font discovery
    // still handles them.
    inlineFonts: false,
    // Match selectors against the HTML body to decide what's critical.
    pruneSource: false, // keep the original .css file intact on disk
    logLevel: "warn",
  });

  // Beasties emits BOTH a `<link rel="preload" as="style" onload=...>`
  // AND keeps the original `<link rel="stylesheet">` for each CSS file
  // it processed — the stylesheet is still render-blocking. Post-process
  // to remove the redundant blocking stylesheet line; the preload+onload
  // swap already covers the no-JS case via the matching <noscript> entry.
  function deRenderBlockCss(html) {
    return html.replace(
      /<link rel="stylesheet" href="([^"]+\.css)"[^>]*\/?>(?!<\/noscript>)/g,
      (match, href) => {
        // Only drop if the same href appears as a preload+onload swap
        // earlier in the document — never drop a lone stylesheet.
        const preloadPattern = new RegExp(
          `<link rel="preload" href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*onload=`,
        );
        return preloadPattern.test(html) ? "" : match;
      },
    );
  }

  let total = 0;
  let saved = 0;
  for (const file of htmls) {
    const before = await readFile(file, "utf8");
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
    const rel = file.replace(`${process.cwd()}/`, "");
    console.log(
      `[inline-critical-css] ${rel}: ${(before.length / 1024).toFixed(1)}KB → ${(after.length / 1024).toFixed(1)}KB`,
    );
  }

  console.log(
    `[inline-critical-css] done — processed ${total} file(s), net size change ${(saved / 1024).toFixed(1)}KB`,
  );
}

main().catch((err) => {
  console.error("[inline-critical-css] fatal:", err);
  process.exit(1);
});
