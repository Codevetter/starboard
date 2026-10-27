import { createAgentSurfaceHandler, discoveryLinkHeader } from './agent-surfaces/handler.mjs';
import { wantsMarkdown, htmlPathFromMarkdown } from './agent-surfaces/http.mjs';
import { shouldBlockScraper } from '../lib/bot-guard.ts';
import sourceRoutes from '../data/public-page-routes.json' with { type: 'json' };
import { STATIC_PAGES, STATIC_ROUTES } from './public-static.mjs';
import { AGENT_SURFACE } from '../../agent-edge.mjs';
const origin = 'https://starboard.codevetter.com';
const sourcePaths = sourceRoutes.map((route) => route.path);
export const isPublicPage = (path) =>
  Object.hasOwn(STATIC_PAGES, path) ||
  sourcePaths.includes(path) ||
  /^\/tools\/[^/]+$/.test(path) ||
  /^\/explore\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(path) ||
  /^\/lists\/[a-zA-Z0-9_-]+$/.test(path);
const markdownURL = (path) =>
  origin +
  (path.startsWith('/explore/') ? `/api/md${path}` : path === '/' ? '/index.md' : `${path}.md`);
const documents = new Set(['/llms.txt', '/llms-full.txt', '/ai.txt', '/api/md/_catalog']);
export async function handlePublicReadability(request, render) {
  const url = new URL(request.url),
    path = url.pathname;
  // Reject request state before Next.js can normalize an RSC request into a redirect.
  if (
    /^\/api\/public-markdown(?:-catalog)?(?:\/|$)/.test(path) &&
    ['cookie', 'authorization', 'cf-access-jwt-assertion', 'rsc', 'next-router-state-tree'].some(
      (header) => request.headers.has(header)
    )
  )
    return new Response(
      request.method === 'HEAD' ? null : JSON.stringify({ error: 'Public source only' }),
      {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      }
    );
  if (
    (path.startsWith('/api/public-markdown/') ||
      !path.startsWith('/api/') ||
      path.startsWith('/api/md/')) &&
    shouldBlockScraper(path, request.headers.get('user-agent'), request.headers)
  )
    return new Response('Automated clients are not permitted on this route.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return null;
  if (path === '/robots.txt')
    return new Response(
      `# Keep in sync with llms.txt and ai.txt.\nUser-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/md\nAllow: /api/ai\nDisallow: /stars\nDisallow: /projects\nDisallow: /login\n\n${['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bytespider'].map((name) => `User-agent: ${name}\nAllow: /\nDisallow: /api/\nAllow: /api/md\nAllow: /api/ai\nDisallow: /stars\nDisallow: /projects\nDisallow: /login\n`).join('\n')}\nSitemap: ${origin}/sitemap.xml\n`,
      { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  const direct = path === '/api/md' || path.startsWith('/api/md/');
  // GitHub repository names may themselves end in .md; preserve browser/RSC documents.
  if (
    /^\/explore\/[^/]+\/[^/]+\.md$/.test(path) &&
    (request.headers.has('rsc') || request.headers.has('next-router-state-tree'))
  )
    return null;
  const suffix = path.endsWith('.md');
  if (
    !direct &&
    /^\/(?:api|_next|_astro|_private|auth|admin|dashboard|projects|stars|login)(?:\/|$)/.test(path)
  )
    return null;
  if (!direct && !suffix && !documents.has(path) && !wantsMarkdown(request)) return null;
  let target = direct
    ? `/${path.replace(/^\/api\/md\/?/, '')}`
    : suffix
      ? htmlPathFromMarkdown(path)
      : path;
  if (!direct && !suffix && !documents.has(path) && !isPublicPage(target)) return null;
  const fetchSource = async (sourcePath) => {
    const r = await render(
      new Request(origin + sourcePath, {
        headers: {
          Accept: 'application/json',
          ...(request.headers.has('user-agent')
            ? { 'User-Agent': request.headers.get('user-agent') }
            : {}),
          ...(request.headers.has('sec-ch-ua')
            ? { 'sec-ch-ua': request.headers.get('sec-ch-ua') }
            : {}),
        },
      })
    );
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Source unavailable');
    const data = await r.json();
    return data;
  };
  try {
    const prefetched = new Map();
    // Literal repository names win negotiation; suffix URLs remain available when
    // no literal public repository exists. Direct URLs are always unambiguous.
    if (!direct && /^\/explore\/[^/]+\/[^/]+\.md$/.test(path) && request.method !== 'OPTIONS') {
      const literal = await fetchSource(`/api/public-markdown${path}`);
      if (literal) {
        if (!wantsMarkdown(request)) return null;
        target = path;
        prefetched.set(path, literal);
      }
    }
    const rows = [...STATIC_ROUTES, ...sourceRoutes];
    if (path === '/api/md/_catalog') {
      if ([...url.searchParams.keys()].some((key) => key !== 'offset'))
        return new Response('Invalid query', { status: 400 });
      const offset = url.searchParams.get('offset') ?? '0';
      if (!/^\d{1,9}$/.test(offset)) return new Response('Invalid offset', { status: 400 });
      const data = await fetchSource(`/api/public-markdown-catalog?offset=${offset}`);
      if (!data) throw new Error('Catalog unavailable');
      const routes = [...(offset === '0' ? STATIC_ROUTES : []), ...data.routes].map((route) => ({
        ...route,
        url: origin + route.path,
        md: markdownURL(route.path),
      }));
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'X-Robots-Tag': 'noindex',
        'Cache-Control': 'no-store',
        Link: discoveryLinkHeader(origin),
      };
      return new Response(
        request.method === 'HEAD'
          ? null
          : JSON.stringify({
              routes,
              next:
                data.nextOffset === null
                  ? null
                  : `${origin}/api/md/_catalog?offset=${data.nextOffset}`,
            }),
        { headers }
      );
    }
    if (isPublicPage(target) && !rows.some((route) => route.path === target)) {
      const data =
        request.method === 'OPTIONS'
          ? null
          : prefetched.has(target)
            ? prefetched.get(target)
            : await fetchSource(`/api/public-markdown${target}`);
      const canonical = data?.path ?? target;
      if (!isPublicPage(canonical) || canonical.split('/')[1] !== target.split('/')[1])
        throw new Error('Invalid public canonical');
      prefetched.set(canonical, data);
      rows.push({
        path: canonical,
        title: data?.title ?? target,
        description: data?.description ?? 'Public catalog source',
        aliases: [path],
        full: false,
      });
    }
    const manifest = {
      name: 'Starboard',
      origin,
      summary: 'Project-aware GitHub repository discovery and evidence-backed tool intelligence.',
      trainingAllowed: true,
      negotiation: true,
      pages: STATIC_PAGES,
      catalog: AGENT_SURFACE.catalog,
      excludedPaths: ['/projects', '/stars', '/login', 'private lists', 'authenticated API routes'],
      notes: [
        'The route catalog paginates public repository, tool and shared-list routes. Full export is bounded to the public landing, guides and default catalog views.',
      ],
    };
    const handler = createAgentSurfaceHandler({
      manifest,
      listMarkdownRoutes: () => rows,
      loadMarkdown: async (route) => {
        if (!isPublicPage(route)) return null;
        const data = prefetched.has(route)
          ? prefetched.get(route)
          : await fetchSource(`/api/public-markdown${route}`);
        if (!data) return null;
        if (
          data.path !== route ||
          typeof data.markdown !== 'string' ||
          !data.markdown.startsWith('# ') ||
          !data.markdown.includes(`Canonical: ${origin}${route}`)
        )
          throw new Error('Invalid public source');
        return data.markdown;
      },
    });
    let response = await handler(request);
    if (
      response &&
      request.method !== 'HEAD' &&
      (path === '/ai.txt' || path === '/llms-full.txt')
    ) {
      const body = await response.text();
      const text =
        path === '/ai.txt'
          ? body.replace(
              /^public-route-count:.*$/m,
              'public-route-count: dynamic; enumerate the paginated catalog'
            )
          : body.replace(
              'registered public pages (limit',
              'selected default public pages; dynamic routes are in the paginated catalog (limit'
            );
      response = new Response(text, { status: response.status, headers: response.headers });
    }
    if (response) {
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('CDN-Cache-Control', 'no-store');
    }
    return response;
  } catch {
    return new Response(
      request.method === 'HEAD'
        ? null
        : '# Temporarily unavailable\n\nThe public source could not be loaded.\n',
      {
        status: 503,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'no-store',
          'CDN-Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          'X-Robots-Tag': 'noindex',
        },
      }
    );
  }
}
export function publicDiscoveryHeaders(request, response) {
  const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
  if (
    !isPublicPage(path) ||
    response.status !== 200 ||
    !response.headers.get('content-type')?.includes('text/html')
  )
    return response;
  const headers = new Headers(response.headers);
  headers.append('Link', discoveryLinkHeader(origin));
  const vary = headers.get('Vary');
  if (
    vary !== '*' &&
    !vary
      ?.toLowerCase()
      .split(',')
      .some((value) => value.trim() === 'accept')
  )
    headers.set('Vary', vary ? `${vary}, Accept` : 'Accept');
  // The existing landing shortcut explicitly returns manually gzipped bytes.
  // Rewrite decoded HTML; the outer timing middleware keeps automatic encoding.
  const compressed =
    path === '/' &&
    headers.get('x-edge-cache') === 'ASSET' &&
    headers.get('content-encoding') === 'gzip';
  const body = compressed
    ? response.body.pipeThrough(new DecompressionStream('gzip'))
    : response.body;
  if (compressed) headers.delete('content-encoding');
  headers.delete('content-length');
  headers.delete('etag');
  const html = new Response(body, { status: response.status, headers });
  const route =
    STATIC_ROUTES.find((r) => r.path === path) || sourceRoutes.find((r) => r.path === path);
  const summary = route?.description || 'Public Starboard repository and tool evidence.';
  const escape = (value) =>
    value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  // biome-ignore lint/correctness/noUndeclaredVariables: Cloudflare Workers runtime API.
  const transformed = new HTMLRewriter()
    .on('meta[name="ai-summary"]', {
      element(e) {
        e.remove();
      },
    })
    .on('link[rel="alternate"][type="text/markdown"]', {
      element(e) {
        e.remove();
      },
    })
    .on('head', {
      element(e) {
        e.append(
          `<meta name="ai-summary" content="${escape(summary)}"><link rel="alternate" type="text/markdown" href="${markdownURL(path)}">`,
          { html: true }
        );
      },
    })
    .transform(html);
  if (!compressed) return transformed;
  transformed.headers.set('content-encoding', 'gzip');
  return transformed;
}
