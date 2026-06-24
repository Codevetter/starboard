import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const PROTECTED_PREFIXES = ['_next/', 'cdn-cgi/', 'BUILD_ID'];

async function walk(dir, rel = '') {
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
  const astroHeaders = existsSync(astroHeadersPath) ? await readFile(astroHeadersPath, 'utf8') : '';
  const targetHeaders = existsSync(targetHeadersPath)
    ? await readFile(targetHeadersPath, 'utf8')
    : '';
  if (!astroHeaders) return false;
  const merged = `# --- from landing-astro/dist/_headers (LCP-critical, takes precedence) ---\n${astroHeaders.trim()}\n\n# --- from Next.js / OpenNext build ---\n${targetHeaders.trim()}\n`;
  await writeFile(targetHeadersPath, merged);
  return true;
}

export async function runOverlay(opts = {}) {
  const astroDist = resolve(opts.astroDist ?? 'landing-astro/dist');
  const target = resolve(opts.assets ?? '.open-next/assets');
  const strict = opts.strict ?? false;

  if (!existsSync(astroDist)) {
    const msg = `[overlay-astro] no ${astroDist} — skipping. Build landing-astro first.`;
    if (strict) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(msg);
    return;
  }
  if (!existsSync(target)) {
    const msg = `[overlay-astro] no ${target} — OpenNext build hasn't run yet. Skipping.`;
    if (strict) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(msg);
    return;
  }

  const files = await walk(astroDist);
  let copied = 0;
  let skipped = 0;
  for (const { src, rel } of files) {
    if (PROTECTED_PREFIXES.some((p) => rel.startsWith(p))) {
      skipped += 1;
      continue;
    }
    if (rel === '_headers') {
      const merged = await mergeHeaders(src, join(target, '_headers'));
      console.log(
        `[overlay-astro] merged _headers (Astro wins for /)${merged ? '' : ' — no Astro headers found'}`
      );
      continue;
    }
    const dest = join(target, rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    copied += 1;
  }
  console.log(
    `[overlay-astro] copied ${copied} file(s) from ${astroDist} → ${target}, skipped ${skipped} protected path(s)`
  );
}
