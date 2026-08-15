// Generated from Fleet's canonical portfolio strip; do not hand-edit.
(() => {
  'use strict';

  const CATALOG_URL = 'https://sassmaker.com/projects.json';
  const INITIAL_PROJECTS = [{"id":"codevetter","name":"CodeVetter","url":"https://codevetter.com","description":"AI code review platform — desktop-first, works offline.","tier":"focus","category":"product","maturity":"public-ready","spotlight":true,"pillarId":"build","domains":["codevetter.com"]},{"id":"pace","name":"HeyPace","url":"https://heypace.app","description":"Local-only macOS voice agent that can understand what is on your screen.","tier":"focus","category":"product","maturity":"public-ready","spotlight":true,"pillarId":"build","domains":["heypace.app"]},{"id":"posttrainllm","name":"PostTrainLLM","url":"https://posttrainllm.com","description":"A local factory for training, evaluating, and running specialist language models.","tier":"focus","category":"product","maturity":"public-ready","spotlight":true,"pillarId":"build","domains":["posttrainllm.com"]},{"id":"fleet-workspace","name":"SaaS Maker","url":"https://sassmaker.com","description":"Software as a specialized service: a living studio of focused products built for particular problems and maintained in public.","tier":"active","category":"product","maturity":"public-ready","spotlight":false,"pillarId":"build","domains":["sassmaker.com","fleet.sassmaker.com"]},{"id":"drank","name":"Drank","url":"https://domains.sassmaker.com","description":"Domain Rating intelligence for product, SEO, and market research.","tier":"active","category":"helper","maturity":"maintained","spotlight":false,"pillarId":"market","domains":["domains.sassmaker.com"]},{"id":"email-manager","name":"Email Manager","url":"https://mail.significanthobbies.com","description":"A private Gmail workspace for local semantic search, sender insights, and explicit unsubscribe workflows.","tier":"active","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["mail.significanthobbies.com"]},{"id":"chatgpt-memory-insights","name":"Memory Map","url":"https://chatgpt.significanthobbies.com","description":"Turn a ChatGPT export into a private, browser-computed map of recurring themes, facts, and conversations.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["chatgpt.significanthobbies.com"]},{"id":"free-ai","name":"Free AI","url":"https://ai-gateway.sassmaker.com","description":"OpenAI-compatible gateway across free-tier model providers.","tier":"active","category":"product","maturity":"maintained","spotlight":false,"pillarId":"build","domains":["ai-gateway.sassmaker.com"]},{"id":"psi-swarm","name":"PSI Swarm","url":"https://performance.sassmaker.com","description":"Repeated Lighthouse distributions for honest website performance tracking.","tier":"active","category":"helper","maturity":"maintained","spotlight":false,"pillarId":"visibility","domains":["performance.sassmaker.com"]},{"id":"high-signal","name":"High Signal","url":"https://highsignal.app","description":"Evidence-backed daily intelligence across technology, startups, finance, and public markets.","tier":"active","category":"product","maturity":"public-ready","spotlight":true,"pillarId":"learn","domains":["highsignal.app"]},{"id":"research-papers","name":"Research Papers","url":"https://papers.highsignal.app","description":"Academic paper discovery and a structured research data asset.","tier":"secondary","category":"product","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["papers.highsignal.app"]},{"id":"knowledge-base","name":"Knowledge Base","url":"https://knowledgebase.sassmaker.com","description":"Private agent search over specialized corpora with ranked citations, provenance, and schema-aware retrieval.","tier":"active","category":"product","maturity":"maintained","spotlight":false,"pillarId":"build","domains":["knowledgebase.sassmaker.com","search.sassmaker.com"]},{"id":"significanthobbies","name":"Significant Hobbies","url":"https://significanthobbies.com","description":"Plan meaningful hobbies, side quests, rituals, and life journeys.","tier":"secondary","category":"personal","maturity":"public-ready","spotlight":false,"pillarId":"learn","domains":["significanthobbies.com"]},{"id":"india-standards","name":"India Standards","url":"https://india-standards.significanthobbies.com","description":"A transparent India demographic standards calculator using aggregate PLFS data, explicit uncertainty ranges, and clear source limits.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["india-standards.significanthobbies.com","india-numbers.significanthobbies.com"]},{"id":"anime-list","name":"Anime List","url":"https://anime.significanthobbies.com","description":"Anime and manga discovery with multi-axis filtering and personal watchlists.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["anime.significanthobbies.com"]},{"id":"chess","name":"Chess Coach","url":"https://chess.significanthobbies.com","description":"Browser chess against Stockfish with optional AI move coaching.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["chess.significanthobbies.com"]},{"id":"looptv","name":"LoopTV","url":"https://tv.significanthobbies.com","description":"A lean-back, TV-style random video player for curated channels.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["tv.significanthobbies.com"]},{"id":"reader","name":"Reader","url":"https://read.significanthobbies.com","description":"Capture, annotate, revisit, and discuss saved reading.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["read.significanthobbies.com"]},{"id":"swe-interview-prep","name":"SWE Interview Prep","url":"https://learn.significanthobbies.com","description":"A learning OS for software-engineering interview practice.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["learn.significanthobbies.com"]},{"id":"calorie","name":"Calorie","url":"https://calorie.significanthobbies.com","description":"A private, local-first food, water, and weight journal with transparent timing guidance.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["calorie.significanthobbies.com"]},{"id":"setline","name":"Setline","url":"https://setline.significanthobbies.com","description":"An iOS-native workout execution tracker for following user-authored plans, recording sets, and timing rest offline.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["setline.significanthobbies.com"]},{"id":"rolepatch","name":"RolePatch","url":"https://rolepatch.com","description":"AI-assisted resume tailoring, role research, and interview preparation.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"build","domains":["rolepatch.com"]},{"id":"karte","name":"Karte","url":"https://karte.cc","description":"An AI link-in-bio that turns a profile into a conversation.","tier":"secondary","category":"personal","maturity":"public-ready","spotlight":false,"pillarId":"build","domains":["karte.cc"]},{"id":"starboard","name":"Starboard","url":"https://starboard.codevetter.com","description":"Organize and semantically search your GitHub stars.","tier":"secondary","category":"product","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["starboard.codevetter.com"]},{"id":"app-health","name":"App Health","url":"https://health.sassmaker.com","description":"Privacy-first endpoint health for Node, Go, and OpenTelemetry services.","tier":"active","category":"product","maturity":"public-ready","spotlight":false,"pillarId":"visibility","domains":["health.sassmaker.com","ingest.sassmaker.com"]},{"id":"motion","name":"Motion","url":"https://motion.significanthobbies.com","description":"Use your body as the controller for an iPhone-hosted game that can mirror to a larger screen.","tier":"active","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"build","domains":["motion.significanthobbies.com"]},{"id":"what-it-takes-to-win","name":"What It Takes to Win","url":"https://paths.significanthobbies.com","description":"Explore 2,585 documented early-breakthrough paths without pretending success follows a formula.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"learn","domains":["paths.significanthobbies.com"]},{"id":"sarthakagrawal-personal","name":"Sarthak Agrawal","url":"https://sarthakagrawal.dev","description":"Personal portfolio of Sarthak Agrawal — AI infrastructure and product engineer.","tier":"secondary","category":"personal","maturity":"maintained","spotlight":false,"pillarId":"personal","domains":["sarthakagrawal.dev"]}];
  const REQUEST_TIMEOUT_MS = 800;
  const css = "\n    :host {\n      --portfolio-strip-bg: color-mix(in srgb, currentColor 4%, transparent);\n      --portfolio-strip-text: currentColor;\n      --portfolio-strip-muted: color-mix(in srgb, currentColor 70%, transparent);\n      --portfolio-strip-border: color-mix(in srgb, currentColor 14%, transparent);\n      --portfolio-strip-focus: #2563eb;\n      display: block;\n      width: 100%;\n      border-block: 1px solid var(--portfolio-strip-border);\n      background: var(--portfolio-strip-bg);\n      color: var(--portfolio-strip-text);\n      font-family: inherit;\n      box-sizing: border-box;\n    }\n    :host([theme='light']) {\n      --portfolio-strip-bg: #fafaf9;\n      --portfolio-strip-text: #292524;\n      --portfolio-strip-muted: #6f6964;\n      --portfolio-strip-border: #e7e5e4;\n    }\n    :host([theme='dark']) {\n      --portfolio-strip-bg: #171717;\n      --portfolio-strip-text: #f5f5f4;\n      --portfolio-strip-muted: #a8a29e;\n      --portfolio-strip-border: #30302f;\n    }\n    *, *::before, *::after { box-sizing: border-box; }\n    .inner { position: relative; display: flex; min-height: 2.875rem; align-items: center; gap: 1rem; padding: 0 1.25rem; }\n    .meta { display: inline-flex; flex: 0 0 auto; align-items: center; gap: .5rem; }\n    .label { color: var(--portfolio-strip-muted); font-size: .6875rem; font-weight: 650; letter-spacing: .12em; line-height: 1; text-transform: uppercase; white-space: nowrap; }\n    button { min-height: 2rem; padding: .25rem .45rem; border: 1px solid var(--portfolio-strip-border); border-radius: .25rem; background: transparent; color: var(--portfolio-strip-muted); font: inherit; font-size: .6875rem; cursor: pointer; }\n    button:hover { color: var(--portfolio-strip-text); }\n    button:focus-visible, a:focus-visible { outline: 2px solid var(--portfolio-strip-focus); outline-offset: 2px; }\n    .viewport { min-width: 0; overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 1.5rem, #000 calc(100% - 1.5rem), transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 1.5rem, #000 calc(100% - 1.5rem), transparent); }\n    .track { display: flex; width: max-content; align-items: center; animation: portfolio-strip-marquee var(--portfolio-strip-speed, 48s) linear infinite; will-change: transform; }\n    .track[data-paused='true'], .viewport:hover .track { animation-play-state: paused; }\n    .viewport:focus-within .track { animation: none; transform: translateX(0); }\n    ul { display: flex; align-items: center; margin: 0; padding: 0; list-style: none; }\n    li { position: relative; display: inline-flex; align-items: center; white-space: nowrap; }\n    a { position: relative; display: inline-flex; min-height: 2rem; align-items: center; border-radius: .2rem; color: var(--portfolio-strip-text); font-size: .8125rem; text-decoration: none; transition: color 150ms ease; }\n    a:hover { color: var(--portfolio-strip-muted); }\n    .dot { padding: 0 .8rem; color: var(--portfolio-strip-muted); font-size: 1.1rem; }\n    .tooltip { position: absolute; z-index: 2; bottom: calc(100% + .5rem); left: 50%; width: max-content; max-width: min(22rem, 80vw); padding: .55rem .7rem; border: 1px solid var(--portfolio-strip-border); border-radius: .4rem; background: #171717; color: #f5f5f4; box-shadow: 0 8px 24px rgb(0 0 0 / .18); font-size: .75rem; font-weight: 400; line-height: 1.35; pointer-events: none; transform: translateX(-50%); white-space: normal; }\n    .tooltip[hidden] { display: none; }\n    @keyframes portfolio-strip-marquee { to { transform: translateX(-50%); } }\n    @media (prefers-reduced-motion: reduce) {\n      .track { animation: none; }\n      .viewport { overflow-x: auto; mask-image: none; -webkit-mask-image: none; }\n      .duplicate, button { display: none; }\n    }\n    @media (max-width: 560px) {\n      .inner { align-items: flex-start; flex-direction: column; gap: .45rem; padding: .8rem 1rem; }\n      .meta { width: 100%; justify-content: space-between; }\n      .viewport { width: 100%; }\n    }\n  ";

  const validProjects = (value) => {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.filter((project) => {
      if (!project || typeof project !== 'object' || typeof project.id !== 'string' || !project.id || typeof project.name !== 'string' || !project.name || seen.has(project.id)) return false;
      try {
        const url = new URL(project.url);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
      } catch { return false; }
      seen.add(project.id);
      return true;
    });
  };

  class PortfolioProjectStrip extends HTMLElement {
    constructor() {
      super();
      this.projects = INITIAL_PROJECTS;
      this.paused = false;
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      this.render();
      this.revalidate();
    }

    render() {
      const current = this.getAttribute('current-project') || '';
      const label = this.getAttribute('label') || 'More from Sarthak';
      const speed = Math.max(24, Number(this.getAttribute('speed')) || 48);
      const projects = validProjects(this.projects).filter((project) => project.id !== current);
      if (!projects.length) { this.hidden = true; return; }
      this.hidden = false;
      const tooltip = document.createElement('div');
      tooltip.className = 'tooltip';
      tooltip.id = 'portfolio-project-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.hidden = true;
      const showDescription = (project) => {
        if (!project.description) return;
        tooltip.textContent = project.description;
        tooltip.hidden = false;
      };
      const hideDescription = () => { tooltip.hidden = true; };
      const list = (duplicate = false) => {
        const ul = document.createElement('ul');
        if (duplicate) { ul.className = 'duplicate'; ul.setAttribute('aria-hidden', 'true'); }
        for (const project of projects) {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.href = project.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = project.name;
          if (duplicate) link.tabIndex = -1;
          if (project.description) {
            link.setAttribute('aria-label', project.name + ': ' + project.description);
            link.setAttribute('aria-describedby', tooltip.id);
            link.addEventListener('pointerenter', () => showDescription(project));
            link.addEventListener('pointerleave', hideDescription);
            link.addEventListener('focus', () => showDescription(project));
            link.addEventListener('blur', hideDescription);
          }
          const dot = document.createElement('span');
          dot.className = 'dot';
          dot.setAttribute('aria-hidden', 'true');
          dot.textContent = '·';
          item.append(link, dot);
          ul.append(item);
        }
        return ul;
      };

      const aside = document.createElement('aside');
      aside.setAttribute('aria-label', label);
      const inner = document.createElement('div');
      inner.className = 'inner';
      const meta = document.createElement('div');
      meta.className = 'meta';
      const heading = document.createElement('span');
      heading.className = 'label';
      heading.textContent = label;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = this.paused ? 'Resume' : 'Pause';
      button.setAttribute('aria-pressed', String(this.paused));
      button.addEventListener('click', () => { this.paused = !this.paused; this.render(); });
      meta.append(heading, button);
      const viewport = document.createElement('div');
      viewport.className = 'viewport';
      const track = document.createElement('div');
      track.className = 'track';
      track.dataset.paused = String(this.paused);
      track.style.setProperty('--portfolio-strip-speed', speed + 's');
      track.append(list(), list(true));
      viewport.append(track);
      inner.append(meta, viewport, tooltip);
      aside.append(inner);
      if ('adoptedStyleSheets' in this.shadowRoot && typeof CSSStyleSheet !== 'undefined') {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        this.shadowRoot.adoptedStyleSheets = [sheet];
        this.shadowRoot.replaceChildren(aside);
      } else {
        const style = document.createElement('style');
        style.textContent = css;
        this.shadowRoot.replaceChildren(style, aside);
      }
    }

    async revalidate() {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(CATALOG_URL, { headers: { accept: 'application/json' }, cache: 'force-cache', signal: controller.signal });
        if (!response.ok) return;
        const projects = validProjects(await response.json());
        if (projects.length) { this.projects = projects; this.render(); }
      } catch {} finally { window.clearTimeout(timeout); }
    }
  }

  if (!customElements.get('portfolio-project-strip')) customElements.define('portfolio-project-strip', PortfolioProjectStrip);
  const script = document.currentScript;
  const mount = () => {
    if (!script || script.dataset.auto === 'false' || document.querySelector('portfolio-project-strip')) return;
    const strip = document.createElement('portfolio-project-strip');
    if (script.dataset.project) strip.setAttribute('current-project', script.dataset.project);
    if (script.dataset.label) strip.setAttribute('label', script.dataset.label);
    if (script.dataset.theme) strip.setAttribute('theme', script.dataset.theme);
    if (script.dataset.speed) strip.setAttribute('speed', script.dataset.speed);
    document.body.append(strip);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
