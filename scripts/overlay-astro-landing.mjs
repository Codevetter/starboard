#!/usr/bin/env node
// overlay-astro-landing.mjs — copies the Astro landing build over the
// Next.js / OpenNext asset bundle so the Worker can serve a single
// deployment: Astro static HTML for `/`, OpenNext SSR for everything else.
//
// Why this exists: the Onyx Deck landing was 2.9s LCP on the Next.js
// Worker (SSR + Tailwind v4 + React hydration). Hand-porting it to Astro
// drops LCP to ~340ms when deployed to CF Pages. But we don't want two
// deployments per project — instead, we let the Astro build emit
// `dist/index.html` and overlay it into `.open-next/assets/` so the
// Workers static-assets binding serves it directly for `/`, no Worker
// invocation at all. Cold-start cost eliminated for the LCP path.
//
// Layout assumptions:
//   - Astro project lives at `landing-astro/` with `output: 'static'`
//   - It builds to `landing-astro/dist/`
//   - The Next.js + OpenNext build has already populated
//     `.open-next/assets/` (run AFTER `opennextjs-cloudflare build`)
//
// What gets overlaid:
//   - `landing-astro/dist/index.html` → `.open-next/assets/index.html`
//   - `landing-astro/dist/_headers` is merged with the existing
//     `.open-next/assets/_headers` if present (Astro's headers go first
//     so they win for `/`)
//   - any other top-level files from Astro dist are copied unless they
//     would clobber a Next.js path (e.g. `_next/`, `cdn-cgi/`)
//
// This runs as the LAST step of `cf:build`, after OpenNext has finished
// writing its bundle. Safe to re-run; idempotent.

import { readdir, readFile, writeFile, copyFile, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const ASTRO_DIST = resolve("landing-astro/dist");
const TARGET = resolve(".open-next/assets");

// Paths under `.open-next/assets/` we must never overwrite — these belong
// to Next.js / OpenNext and clobbering them would break the Worker.
const PROTECTED_PREFIXES = ["_next/", "cdn-cgi/", "BUILD_ID"];

async function walk(dir, rel = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const fullSrc = join(dir, e.name);
    const fullRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...(await walk(fullSrc, fullRel)));
    } else {
      out.push({ src: fullSrc, rel: fullRel });
    }
  }
  return out;
}

async function mergeHeaders(astroHeadersPath, targetHeadersPath) {
  const astroHeaders = existsSync(astroHeadersPath)
    ? await readFile(astroHeadersPath, "utf8")
    : "";
  const targetHeaders = existsSync(targetHeadersPath)
    ? await readFile(targetHeadersPath, "utf8")
    : "";
  if (!astroHeaders) return false;
  // Astro headers FIRST so they win for the routes they declare (typically `/`).
  // The Next.js `_headers` (security headers, `/_next/*` cache rules) come second.
  const merged = `# --- from landing-astro/dist/_headers (LCP-critical, takes precedence) ---\n${astroHeaders.trim()}\n\n# --- from Next.js / OpenNext build ---\n${targetHeaders.trim()}\n`;
  await writeFile(targetHeadersPath, merged);
  return true;
}

async function main() {
  if (!existsSync(ASTRO_DIST)) {
    console.warn(`[overlay-astro] no landing-astro/dist — skipping. Build it first with: cd landing-astro && pnpm build`);
    return;
  }
  if (!existsSync(TARGET)) {
    console.warn(`[overlay-astro] no .open-next/assets — OpenNext build hasn't run yet. Skipping.`);
    return;
  }

  const files = await walk(ASTRO_DIST);
  let copied = 0;
  let skipped = 0;
  for (const { src, rel } of files) {
    if (PROTECTED_PREFIXES.some((p) => rel.startsWith(p))) {
      skipped += 1;
      continue;
    }
    // _headers gets merged, not overwritten.
    if (rel === "_headers") {
      const merged = await mergeHeaders(src, join(TARGET, "_headers"));
      console.log(`[overlay-astro] merged _headers (Astro wins for /)${merged ? "" : " — no Astro headers found"}`);
      continue;
    }
    const dest = join(TARGET, rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    copied += 1;
  }
  console.log(`[overlay-astro] copied ${copied} file(s) from landing-astro/dist → .open-next/assets/, skipped ${skipped} protected path(s)`);
}

main().catch((err) => {
  console.error("[overlay-astro] fatal:", err);
  process.exit(1);
});
