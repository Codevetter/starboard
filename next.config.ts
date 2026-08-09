import type { NextConfig } from 'next';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://us-assets.i.posthog.com", // unsafe-inline/eval required by Next.js
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://avatars.githubusercontent.com https://github.com",
      "connect-src 'self' https://api.github.com https://us.i.posthog.com https://us-assets.i.posthog.com",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const privatePageHeaders = [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }];

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: 'standalone',
  outputFileTracingRoot: projectRoot,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      { source: '/login', headers: privatePageHeaders },
      { source: '/projects', headers: privatePageHeaders },
      { source: '/projects/:path*', headers: privatePageHeaders },
      { source: '/stars', headers: privatePageHeaders },
    ];
  },
};

export default nextConfig;

// Wire opennext-cloudflare for `next dev` so the AI binding (and any others)
// are available in development the same way they are in deployed Workers.
// No-op when not running under Next dev / opennext.
if (process.env.NODE_ENV === 'development') {
  import('@opennextjs/cloudflare')
    .then((m) => m.initOpenNextCloudflareForDev?.())
    .catch(() => {
      /* package not installed in this context — fine */
    });
}
