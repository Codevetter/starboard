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
  "llmsTxt": "# Starboard\n\n> GitHub stars organizer with semantic search — sub-product of CodeVetter for repo intelligence.\n\n## Product\n\n- [Home](https://starboard.codevetter.com/): Product\n- [Discover](https://starboard.codevetter.com/discover): Browse and search the seeded public repository corpus\n- [Tools](https://starboard.codevetter.com/tools): Detected tool and framework intelligence\n- [Changelog](https://starboard.codevetter.com/changelog): Verified product history\n- [About](https://starboard.codevetter.com/about): Product purpose and scope\n- [Privacy](https://starboard.codevetter.com/privacy): Privacy and data handling\n- [Terms](https://starboard.codevetter.com/terms): Terms of use\n\n## Machine surfaces\n\n- [Agent catalog](https://starboard.codevetter.com/api/ai): JSON inventory of public surfaces\n- [Homepage markdown](https://starboard.codevetter.com/index.md): Product brief without JS\n- [This index](https://starboard.codevetter.com/llms.txt)\n",
  "indexMd": "# Starboard\n\nGitHub stars organizer, repository discovery surface, and semantic search product.\n\n## Public without sign-in\n\n- Browse and search the seeded Discover corpus\n- Inspect detected tool and framework intelligence\n- Read the product history, scope, privacy policy, and terms\n\n## With GitHub sign-in\n\n- Sync and organize personal stars with tags and collections\n- Search starred repositories and receive fleet-aware recommendations\n- Track maintainer signals, alerts, and shareable insight reports\n\n## Agent entrypoints\n\n- https://starboard.codevetter.com/llms.txt\n- https://starboard.codevetter.com/api/ai\n- https://starboard.codevetter.com/index.md\n",
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
