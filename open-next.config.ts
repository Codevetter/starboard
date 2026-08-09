import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Dynamic SSR routes work without an incremental-cache override. The
// static-assets implementation is only safe for fully static sites; using it
// here can serve build-time or authenticated HTML across requests. The Astro
// landing and immutable files remain cached independently through _headers.
export default defineCloudflareConfig({});
