import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// Use CF Workers Static Assets as the incremental cache.
// This is the right override when the app is fully prerendered (no
// runtime revalidation): OpenNext serves prerendered HTML from the
// assets binding instead of re-rendering the React tree on every
// request. Crucially, this is what makes the Beasties-modified HTML
// (with inline critical CSS) actually reach the browser; without an
// incremental cache the runtime re-renders from page.js and the
// inlined CSS is lost.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
