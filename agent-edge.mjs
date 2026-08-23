/**
 * Portable agent-edge handler — copy or generate into each product.
 * Spec: foundry/ops/docs/agent-indexing-standard.md
 *
 * Usage in worker.mjs (before openNext.fetch):
 *   import { handleAgentEdge } from './agent-edge.mjs'
 *   const agent = handleAgentEdge(request)
 *   if (agent) return agent
 */

/** @type {{ name: string, url: string, llmsTxt: string, llmsFullTxt?: string, indexMd: string, catalog: object }} */
// biome-ignore format: generated payload from apply-agent-surfaces (JSON keys/quotes)
export const AGENT_SURFACE = {
  "name": "Starboard",
  "url": "https://starboard.codevetter.com",
  "llmsFullTxt": "# Starboard — full agent brief\n\nGitHub stars organizer with semantic search — sub-product of CodeVetter for repo intelligence.\n\n## Index\n\n# Starboard\n\nGitHub stars organizer, repository discovery surface, and semantic search product.\n\n## Public without sign-in\n\n- Browse and search the seeded Discover corpus\n- Inspect detected tool and framework intelligence\n- Read the product history, scope, privacy policy, and terms\n\n## With GitHub sign-in\n\n- Sync and organize personal stars with tags and collections\n- Search starred repositories and receive fleet-aware recommendations\n- Track maintainer signals, alerts, and shareable insight reports\n\n## Agent entrypoints\n\n- https://starboard.codevetter.com/llms.txt\n- https://starboard.codevetter.com/api/ai\n- https://starboard.codevetter.com/index.md\n\n## Product links\n\n- Home: https://starboard.codevetter.com/ — Product\n- Discover: https://starboard.codevetter.com/discover — Browse and search the seeded public repository corpus\n- Tools: https://starboard.codevetter.com/tools — Detected tool and framework intelligence\n- Changelog: https://starboard.codevetter.com/changelog — Verified product history\n- About: https://starboard.codevetter.com/about — Product purpose and scope\n- Privacy: https://starboard.codevetter.com/privacy — Privacy and data handling\n- Terms: https://starboard.codevetter.com/terms — Terms of use\n\n## Machine surfaces\n\n- https://starboard.codevetter.com/llms.txt\n- https://starboard.codevetter.com/llms-full.txt\n- https://starboard.codevetter.com/api/ai\n- https://starboard.codevetter.com/index.md\n- https://starboard.codevetter.com/sitemap.xml\n- https://starboard.codevetter.com/robots.txt\n\n## Contact\n\n- Owner: https://sarthakagrawal.dev\n- Agent email for directory verification: sarthakagrawal@agentmail.to\n",
  "llmsTxt": "# Starboard\n\n> Project-aware GitHub repository discovery and evidence-backed tool intelligence.\n\n## When to use this\n\n- Discovering and browsing GitHub repositories by semantic similarity, tags, or tool category\n- Finding alternatives to a known tool or framework via the seeded public corpus\n- Organizing personal GitHub stars with tags, collections, and semantic search (requires sign-in)\n- Getting evidence-backed tool intelligence and framework detection for a project\n- Answering questions about what tools or libraries a repository uses\n\n## Product\n\n- [Home](https://starboard.codevetter.com/): Product\n- [Project Preview](https://starboard.codevetter.com/project-preview): Preview cataloged recommendations before sign-in; new lookups require GitHub sign-in\n- [Discover](https://starboard.codevetter.com/discover): Browse and search the seeded public repository corpus\n- [Tools](https://starboard.codevetter.com/tools): Detected tool and framework intelligence\n- [Changelog](https://starboard.codevetter.com/changelog): Verified product history\n- [About](https://starboard.codevetter.com/about): Product purpose and scope\n- [Privacy](https://starboard.codevetter.com/privacy): Privacy and data handling\n- [Terms](https://starboard.codevetter.com/terms): Terms of use\n\n## Machine surfaces\n\n- [Agent catalog](https://starboard.codevetter.com/api/ai): JSON inventory of public surfaces\n- [OpenAPI spec](https://starboard.codevetter.com/openapi.json): Machine-readable API contract\n- [Homepage markdown](https://starboard.codevetter.com/index.md): Product brief without JS\n- [This index](https://starboard.codevetter.com/llms.txt)\n",
  "indexMd": "# Starboard\n\nGitHub stars organizer, repository discovery surface, and semantic search product.\n\n## Public without sign-in\n\n- Browse and search the seeded Discover corpus\n- Inspect detected tool and framework intelligence\n- Read the product history, scope, privacy policy, and terms\n\n## With GitHub sign-in\n\n- Sync and organize personal stars with tags and collections\n- Search starred repositories and receive fleet-aware recommendations\n- Track maintainer signals, alerts, and shareable insight reports\n\n## Agent entrypoints\n\n- https://starboard.codevetter.com/llms.txt\n- https://starboard.codevetter.com/api/ai\n- https://starboard.codevetter.com/index.md\n",
  "catalog": {
    "name": "Starboard",
    "version": "1",
    "url": "https://starboard.codevetter.com",
    "llms": "https://starboard.codevetter.com/llms.txt",
    "llmsFull": "https://starboard.codevetter.com/llms-full.txt",
    "sitemap": "https://starboard.codevetter.com/sitemap.xml",
    "robots": "https://starboard.codevetter.com/robots.txt",
    "openapi": "https://starboard.codevetter.com/openapi.json",
    "markdown": {
      "suffix": ".md",
      "negotiation": true
    },
    "surfaces": [
      {
        "id": "home",
        "url": "https://starboard.codevetter.com/",
        "md": "https://starboard.codevetter.com/index.md",
        "kind": "static",
        "description": "Product home"
      },
      {
        "id": "discover",
        "url": "https://starboard.codevetter.com/discover",
        "md": "https://starboard.codevetter.com/discover.md",
        "kind": "static",
        "description": "Browse and search the seeded public repository corpus"
      },
      {
        "id": "tools",
        "url": "https://starboard.codevetter.com/tools",
        "md": "https://starboard.codevetter.com/tools.md",
        "kind": "static",
        "description": "Detected tool and framework intelligence"
      },
      {
        "id": "changelog",
        "url": "https://starboard.codevetter.com/changelog",
        "md": "https://starboard.codevetter.com/changelog.md",
        "kind": "static",
        "description": "Verified product history"
      },
      {
        "id": "about",
        "url": "https://starboard.codevetter.com/about",
        "md": "https://starboard.codevetter.com/about.md",
        "kind": "static",
        "description": "Product purpose and scope"
      },
      {
        "id": "privacy",
        "url": "https://starboard.codevetter.com/privacy",
        "md": "https://starboard.codevetter.com/privacy.md",
        "kind": "static",
        "description": "Privacy and data handling"
      },
      {
        "id": "terms",
        "url": "https://starboard.codevetter.com/terms",
        "md": "https://starboard.codevetter.com/terms.md",
        "kind": "static",
        "description": "Terms of use"
      }
    ],
    "auth": {
      "public": true,
      "notes": "Auth-walled app routes are not agent-indexed unless listed here."
    }
  }
};

/**
 * @param {Request} request
 * @returns {Response | null}
 */
export function handleAgentEdge(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  const path = url.pathname === '' ? '/' : url.pathname;

  if (path === '/llms.txt') {
    return text(AGENT_SURFACE.llmsTxt, 'text/plain; charset=utf-8');
  }
  if (path === '/llms-full.txt' && AGENT_SURFACE.llmsFullTxt) {
    return text(AGENT_SURFACE.llmsFullTxt, 'text/plain; charset=utf-8');
  }
  if (path === '/index.md') {
    return text(AGENT_SURFACE.indexMd, 'text/markdown; charset=utf-8');
  }
  if (path === '/api/ai') {
    // Re-bind origin so preview/custom domains stay correct
    const catalog = {
      ...AGENT_SURFACE.catalog,
      url: url.origin,
      llms: `${url.origin}/llms.txt`,
      llmsFull: `${url.origin}/llms-full.txt`,
      sitemap: AGENT_SURFACE.catalog.sitemap
        ? String(AGENT_SURFACE.catalog.sitemap).replace(AGENT_SURFACE.url, url.origin)
        : `${url.origin}/sitemap.xml`,
      openapi: `${url.origin}/openapi.json`,
      surfaces: (AGENT_SURFACE.catalog.surfaces || []).map((s) => ({
        ...s,
        url: s.url ? String(s.url).replace(AGENT_SURFACE.url, url.origin) : s.url,
        md: s.md ? String(s.md).replace(AGENT_SURFACE.url, url.origin) : s.md,
      })),
    };
    return json(catalog);
  }

  if (path === '/openapi.json') {
    return json(openapiSpecForOrigin(url.origin));
  }

  // JSON error for unknown /api/* paths
  if (path.startsWith('/api/')) {
    return jsonError(404, 'not_found', `Unknown API path: ${path}`, path);
  }

  // Homepage markdown negotiation
  if ((path === '/' || path === '') && wantsMarkdown(request)) {
    return text(AGENT_SURFACE.indexMd, 'text/markdown; charset=utf-8', {
      Link: '</index.md>; rel="alternate"; type="text/markdown"',
      Vary: 'Accept',
    });
  }

  // Agent-friendly 404: markdown body for Accept: text/markdown
  if (wantsMarkdown(request) && !path.includes('.')) {
    return markdown404(path, url.origin);
  }

  return null;
}

function wantsMarkdown(request) {
  const accept = (request.headers.get('accept') || '').toLowerCase();
  if (!accept.includes('text/markdown')) return false;
  if (!accept.includes('text/html')) return true;
  return accept.indexOf('text/markdown') < accept.indexOf('text/html');
}

function openapiSpecForOrigin(origin) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Starboard public API',
      version: '1.0.0',
      description:
        'Project-aware GitHub repository discovery and evidence-backed tool intelligence.',
      contact: { name: 'Starboard', url: origin },
    },
    servers: [{ url: origin }],
    tags: [{ name: 'agent-surfaces', description: 'Machine-readable public surfaces' }],
    paths: {
      '/api/ai': {
        get: {
          operationId: 'getAgentCatalog',
          tags: ['agent-surfaces'],
          summary: 'Agent catalog',
          responses: {
            200: { description: 'Agent catalog JSON', content: { 'application/json': {} } },
          },
        },
      },
      '/llms.txt': {
        get: {
          operationId: 'getLlmsTxt',
          tags: ['agent-surfaces'],
          summary: 'llms.txt index',
          responses: { 200: { description: 'Markdown index', content: { 'text/plain': {} } } },
        },
      },
      '/sitemap.xml': {
        get: {
          operationId: 'getSitemap',
          tags: ['agent-surfaces'],
          summary: 'Sitemap',
          responses: { 200: { description: 'XML sitemap', content: { 'application/xml': {} } } },
        },
      },
      '/openapi.json': {
        get: {
          operationId: 'getOpenApiSpec',
          tags: ['agent-surfaces'],
          summary: 'OpenAPI specification',
          description: 'This document.',
          responses: {
            200: { description: 'OpenAPI 3.1 spec', content: { 'application/json': {} } },
          },
        },
      },
    },
  };
}

function jsonError(status, code, message, path) {
  return new Response(JSON.stringify({ error: { code, message, path } }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function markdown404(pathname, origin) {
  const body = `# 404 — Not Found

\`${pathname}\` does not exist on this site.

## Where to look next

- [Home](${origin}/)
- [Sitemap](${origin}/sitemap.xml)
- [Agent index](${origin}/llms.txt)
- [Agent catalog (JSON)](${origin}/api/ai)
- [OpenAPI spec](${origin}/openapi.json)
`;
  return new Response(body, {
    status: 404,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function text(body, type, extra = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=300',
      ...extra,
    },
  });
}

function json(data) {
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
