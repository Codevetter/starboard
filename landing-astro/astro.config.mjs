// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

// Static Astro landing for starboard.
//
// Keep the landing's styles in its document: the cold trace discovers the
// body font only after the blocking stylesheet finishes. Tailwind v4 runs
// through its Vite plugin; lightningcss
// is the minifier (Tailwind v4 already uses lightningcss internally for
// transform, so no extra `css.transformer` config — keep just the
// minifier to avoid double-processing).
//
// File-format output (`build.format: 'file'`) emits `index.html` at the
// repo root rather than `index/index.html`, which is what the overlay
// script copies into `.open-next/assets/index.html`.
export default defineConfig({
  site: 'https://starboard.codevetter.com',
  output: 'static',
  trailingSlash: 'never',
  integrations: [react()],
  build: {
    format: 'file',
    inlineStylesheets: 'always',
  },
  vite: {
    plugins: [tailwindcss()],
    build: { cssMinify: 'lightningcss' },
  },
});
