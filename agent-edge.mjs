/**
 * Portable agent-edge handler — copy or generate into each product.
 * Spec: fleet-ops/docs/agent-indexing-standard.md
 *
 * Usage in worker.mjs (before openNext.fetch):
 *   import { handleAgentEdge } from './agent-edge.mjs'
 *   const agent = handleAgentEdge(request)
 *   if (agent) return agent
 */

/** @type {{ name: string, url: string, llmsTxt: string, llmsFullTxt?: string, indexMd: string, catalog: object }} */
export const AGENT_SURFACE = {
  "name": "Starboard",
  "url": "https://starboard.codevetter.com",
  "llmsFullTxt": "# Starboard — full agent brief\n\nGitHub stars organizer with semantic search — sub-product of CodeVetter for repo intelligence.\n\n## Index\n\n# Starboard\n\nGitHub stars organizer + semantic search (CodeVetter sub-product).\n\n## What it is\n\n- Organize and search starred repositories\n- Semantic search over star metadata\n\n## Agent entrypoints\n\n- https://starboard.codevetter.com/llms.txt\n- https://starboard.codevetter.com/api/ai\n- https://starboard.codevetter.com/index.md\n\n## Product links\n\n- Home: https://starboard.codevetter.com/ — Product\n- CodeVetter: https://codevetter.com/ — Parent product\n\n## Machine surfaces\n\n- https://starboard.codevetter.com/llms.txt\n- https://starboard.codevetter.com/llms-full.txt\n- https://starboard.codevetter.com/api/ai\n- https://starboard.codevetter.com/index.md\n- https://starboard.codevetter.com/sitemap.xml\n- https://starboard.codevetter.com/robots.txt\n\n## Contact / fleet\n\n- Fleet: https://sassmaker.com\n- Agent email for directory verification: sarthakagrawal@agentmail.to\n",
  "llmsTxt": "# Starboard\n\n> GitHub stars organizer with semantic search — sub-product of CodeVetter for repo intelligence.\n\n## Product\n\n- [Home](https://starboard.codevetter.com/): Product\n- [CodeVetter](https://codevetter.com/): Parent product\n\n## Machine surfaces\n\n- [Agent catalog](https://starboard.codevetter.com/api/ai): JSON inventory of public surfaces\n- [Homepage markdown](https://starboard.codevetter.com/index.md): Product brief without JS\n- [This index](https://starboard.codevetter.com/llms.txt)\n\n## Optional\n\n- [Foundry](https://sassmaker.com): Parent fleet showcase\n",
  "indexMd": "# Starboard\n\nGitHub stars organizer + semantic search (CodeVetter sub-product).\n\n## What it is\n\n- Organize and search starred repositories\n- Semantic search over star metadata\n\n## Agent entrypoints\n\n- https://starboard.codevetter.com/llms.txt\n- https://starboard.codevetter.com/api/ai\n- https://starboard.codevetter.com/index.md\n",
  "catalog": {
    "name": "Starboard",
    "version": "1",
    "url": "https://starboard.codevetter.com",
    "llms": "https://starboard.codevetter.com/llms.txt",
    "llmsFull": "https://starboard.codevetter.com/llms-full.txt",
    "sitemap": "https://starboard.codevetter.com/sitemap.xml",
    "robots": "https://starboard.codevetter.com/robots.txt",
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
        "id": "codevetter",
        "url": "https://codevetter.com/",
        "md": null,
        "kind": "static",
        "description": "Parent product"
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
      surfaces: (AGENT_SURFACE.catalog.surfaces || []).map((s) => ({
        ...s,
        url: s.url ? String(s.url).replace(AGENT_SURFACE.url, url.origin) : s.url,
        md: s.md ? String(s.md).replace(AGENT_SURFACE.url, url.origin) : s.md,
      })),
    };
    return json(catalog);
  }

  // Homepage markdown negotiation
  if ((path === '/' || path === '') && wantsMarkdown(request)) {
    return text(AGENT_SURFACE.indexMd, 'text/markdown; charset=utf-8', {
      Link: '</index.md>; rel="alternate"; type="text/markdown"',
      Vary: 'Accept',
    });
  }

  return null;
}

function wantsMarkdown(request) {
  const accept = (request.headers.get('accept') || '').toLowerCase();
  if (!accept.includes('text/markdown')) return false;
  if (!accept.includes('text/html')) return true;
  return accept.indexOf('text/markdown') < accept.indexOf('text/html');
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
