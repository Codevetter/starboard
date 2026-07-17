// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Static Astro landing for starboard.
//
// LCP path is one round-trip: HTML → fonts → paint. CSS is inlined into
// the HTML head (`build.inlineStylesheets: 'always'`) so no extra
// stylesheet fetch. Tailwind v4 runs through its Vite plugin; lightningcss
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
  build: {
    format: 'file',
    inlineStylesheets: 'always',
  },
  vite: {
    plugins: [tailwindcss()],
    build: { cssMinify: 'lightningcss' },
  },
});
