# GitHub Starred Repo Intelligence: Screenshot Shot List (v2)

This document outlines 8 key product screenshots to showcase Starboard's value as the intelligence layer on top of GitHub stars — hybrid search, radar signals, AI curation, and bulk organization that turns a flat, noisy list into an actionable library.

**Focus:** GitHub starred repo intelligence (releases, momentum, maintenance/stale signals, semantic recall, themed bundles).  
**Prior related assets (v2 iteration context):**  
- [write-founder-launch-note.md](./write-founder-launch-note.md) — personal founder pain + radar/search/stale positioning, includes proposed X queue ideas (task source for prior Symphony run).  
- [write-reddit-safe-launch-draft.md](./write-reddit-safe-launch-draft.md) — Reddit-safe, problem-first launch copy emphasizing read-only trust, hybrid search, radar buckets, and "second brain" value.  
- No first-pass `docs/marketing/screenshot-shot-list.md` existed for starboard (per v2 pattern in sibling projects like swe-interview-prep). This is the initial shot list asset.  
- Supporting product truth: `src/app/about/page.tsx`, landing hero + `Sample*` preview components, `/stars`, `/radar`, `/stack-builder`, `/explore/[...slug]`, `lib/release-radar.ts`, embedding + RRF search paths.

Screenshots should be captured at realistic data states (use seeded demo or personal account with 200+ stars for richness). Capture both clean "proof" crops and full-context views. Prioritize high-signal moments over generic UI polish.

### 1. Main Stars Library — Radar-Ranked Default View
*   **Route/State:** `/stars` (default relevance sort, no heavy filters; active filter chips for radar lanes or recent signals visible via card metadata)
*   **Caption:** "Your stars, ranked by what actually happened this week."
*   **Why it sells:** Immediately contrasts GitHub's flat reverse-chron list with Starboard's signal-aware grid. Shows last-updated dates, save status, tags, and subtle momentum cues that surface the repos worth attention right now — the core "intelligence" promise.
*   **Platform:** Desktop

### 2. Hybrid Semantic Search — Plain-Language Query Over Your Own Stars
*   **Route/State:** `/stars?q=lightweight+state+management+still+seeing+updates&sort=relevance` (or similar high-signal query like "Go HTTP libs with recent releases")
*   **Caption:** "Ask in plain English. Find the exact repo you vaguely remembered starring last year."
*   **Why it sells:** Demonstrates the hybrid (lexical + 768-dim vector, RRF fusion) search that actually works across *your private stars* (plus discovery seeding). Proves recall and relevance without forcing you to remember exact names or browse hundreds of pages. The killer feature for long-term star hoarders.
*   **Platform:** Desktop

### 3. Weekly Radar — Release / Momentum / Maintenance Intelligence
*   **Route/State:** `/radar` (full view with all three lanes populated; one repo flagged as archived or 6mo+ silent)
*   **Caption:** "The radar that watches your stars so you don't have to."
*   **Why it sells:** This is the differentiated "why it matters now" layer. Buckets repos into actionable weekly lanes (new releases/activity, high-momentum, at-risk/stale) with clear verdicts. Directly sells the "never miss what matters / prune the noise" outcome. Highest-proof asset for founder notes and X threads.
*   **Platform:** Desktop

### 4. Repo Deep Dive + Semantic Similar + Social Proof
*   **Route/State:** `/explore/[owner]/[repo]` (e.g. a popular TS or Go repo from user's stars; similar repos section + 1-2 comments/votes visible)
*   **Caption:** "One click from any card: full context, similar repos via embeddings, and community notes from your circle."
*   **Why it sells:** Shows the per-repo intelligence surface (maintenance signals, links to GitHub, similar recommendations powered by the same vector index). The comments/votes/likes turn individual stars into a living, annotated knowledge base — turning "I starred it" into "here's why it mattered to me and people I trust."
*   **Platform:** Desktop

### 5. AI Stack Builder — Themed Collection Curation From Your Stars
*   **Route/State:** `/stack-builder` (goal="ai-app" or "web-app" selected; 4-6 suggested repos with role/explanation chips)
*   **Caption:** "Tell Starboard the kind of project you're exploring. It curates the best pieces you've already starred."
*   **Why it sells:** Moves beyond passive search to active, goal-oriented intelligence. The stack builder uses your own library + embeddings to propose coherent, themed bundles you can save/share. Perfect proof point for "I have 1200 stars but now I can actually use them to ship."
*   **Platform:** Desktop

### 6. Bulk Organization in Action — Multi-Select + List Assignment
*   **Route/State:** `/stars` (3+ repos selected via checkboxes; BulkActionBar visible with "Assign to list", save/unsave, "Compare" enabled)
*   **Caption:** "Hundreds of stars, organized in minutes. Bulk tag, list, and compare without leaving the grid."
*   **Why it sells:** Addresses the real pain of scale. Visual proof that Starboard isn't just read-only eye candy — it gives you power tools (bulk + list sharing) to turn the archive into structured collections. The "Compare" affordance is a direct hero claim realized.
*   **Platform:** Desktop

### 7. Side-by-Side Compare Sheet
*   **Route/State:** `/stars` (compare sheet open via BulkActionBar or direct trigger, showing 2-3 repos side-by-side with stars, updated, language, tags, save state)
*   **Caption:** "Finally compare the two React state libraries you've been meaning to evaluate."
*   **Why it sells:** Delivers on the explicit landing hero promise ("Compare repos side-by-side"). Turns vague memory into a concrete, scannable decision surface. High visual impact for tweets and demo videos — instantly communicates "this is the tool that respects your time."
*   **Platform:** Desktop

### 8. Public Shared Collection + Discover Feed (Distribution & Proof)
*   **Route/State:** `/lists/[public-slug]` (or `/discover?q=...` with populated grid and facets) — clean public view of a curated list with share UI
*   **Caption:** "Turn your private intelligence into a shareable collection. Or browse the public discovery layer seeded with high-signal repos."
*   **Why it sells:** Shows the flywheel: personal tool → public artifact. Public lists prove the "collections" feature works for distribution and reputation. Discover demonstrates the same semantic + filter intelligence applied to a broader seeded corpus — expands the addressable value beyond "just my stars."
*   **Platform:** Desktop & Mobile (capture responsive grid on mobile for one variant)

---

**Usage notes for production screenshots:**
- Prefer real-ish data density (repos with tags, lists, recent activity, one archived). Use the Sample* components on `/` as style reference for marketing crops.
- For search/radar shots, ensure at least one "win" (relevant result or clear lane signal) and one edge (stale/archived).
- Capture at 2x for retina, with clean browser chrome or devtools-hidden.
- Mobile: primarily for #8; test responsive filter sheet and card stack.
- After capture, store originals in a shared drive / SaaS Maker assets bucket; produce 1200px and square crops for X / LinkedIn.
- These 8 form a reusable modular library: any launch thread, onboarding email, or comparison landing can pull 2-4 without new photography.

**Next:** When ready to execute, open the actual product in a populated account, capture, then feed the best frames back into marketing queue ideas or founder assets.

---

## Proposed SaaS Maker Marketing Queue Ideas (v2 — Screenshot Asset Launch)

These ideas are prepared for direct creation via the required `fnd api POST /v1/marketing/posts` contract. They treat the new screenshot shot list as the source of reusable visual proof assets for X distribution. Repo docs are supporting notes only.

**All use (per contract):**
- project_slug: "starboard"
- channel: "x"
- status: "generated"
- source_type: "task"
- source_id / task_id: "275d70fd-2657-4e3c-8faa-556f0342c9f3"

### Idea 1: Radar screenshot as the hero proof of "stars that actually move"
```json
{
  "project_slug": "starboard",
  "channel": "x",
  "status": "generated",
  "source_type": "task",
  "source_id": "275d70fd-2657-4e3c-8faa-556f0342c9f3",
  "task_id": "275d70fd-2657-4e3c-8faa-556f0342c9f3",
  "title": "The one screenshot that shows why GitHub stars needed an intelligence layer",
  "hook": "800 stars. One radar view. Finally know which ones shipped this week.",
  "body": "GitHub stars are intent signals with zero memory.\n\nI built Starboard to fix that for my own list.\n\nThis single screen (the weekly radar) buckets everything into Release / Momentum / Maintenance + flags the archived and the long-silent.\n\nNo more manual \"when did this last update?\" hunts.\n\nThe full 8-shot list for anyone building similar tools is now in the repo (docs/marketing/iterations/v2/add-screenshot-shot-list.md). Reusable proof assets while we keep shipping.\n\nRead-only. Your data stays yours.",
  "cta": "Open Starboard with your stars and tell me which lane surprised you most."
}
```

### Idea 2: Semantic search + similar repos (the \"I actually found it\" moment)
```json
{
  "project_slug": "starboard",
  "channel": "x",
  "status": "generated",
  "source_type": "task",
  "source_id": "275d70fd-2657-4e3c-8faa-556f0342c9f3",
  "task_id": "275d70fd-2657-4e3c-8faa-556f0342c9f3",
  "title": "Type what you vaguely remember. Get the repo + the ones like it.",
  "hook": "\"lightweight state management still seeing updates\" — and it just worked across my private stars.",
  "body": "Hybrid search (lexical + 768-dim embeddings, RRF) over the exact repos you've already starred.\n\nPlus \"similar\" recommendations on the detail page so one good find surfaces the whole family.\n\nThis is one of the 8 key shots in the new Starboard screenshot library for GitHub starred repo intelligence.\n\nBuilt because my 1000+ star list had become a black hole. Read-only OAuth only.",
  "cta": "Try a real query from your own history and send the result (good or bad)."
}
```

### Idea 3: Stack builder + bulk tools (from archive to shippable bundle)
```json
{
  "project_slug": "starboard",
  "channel": "x",
  "status": "generated",
  "source_type": "task",
  "source_id": "275d70fd-2657-4e3c-8faa-556f0342c9f3",
  "task_id": "275d70fd-2657-4e3c-8faa-556f0342c9f3",
  "title": "I have 1200 stars. Starboard just handed me a ready-to-ship AI stack from them.",
  "hook": "Pick a goal. Get a curated bundle of things you already saved — with the reasoning.",
  "body": "The stack builder + bulk list assignment + compare sheet turn the \"I meant to revisit this\" pile into deliberate collections you can actually use or share publicly.\n\nAll eight shots (radar, search, stack builder, compare, bulk, public lists, etc.) live in the new v2 shot list doc. Grab them for your own launch threads or site.\n\nThis is still early. The signals and groupings will improve with your feedback.",
  "cta": "Try the stack builder with one of the four goals and tell me what it got right or missed."
}
```

**How to create (run on a machine with `fnd` installed and authenticated session):**
```bash
# Idea 1
fnd api POST /v1/marketing/posts --auth session --body '{"project_slug":"starboard","channel":"x","status":"generated","source_type":"task","source_id":"275d70fd-2657-4e3c-8faa-556f0342c9f3","task_id":"275d70fd-2657-4e3c-8faa-556f0342c9f3","title":"The one screenshot that shows why GitHub stars needed an intelligence layer","hook":"800 stars. One radar view. Finally know which ones shipped this week.","body":"GitHub stars are intent signals with zero memory.\n\nI built Starboard to fix that for my own list.\n\nThis single screen (the weekly radar) buckets everything into Release / Momentum / Maintenance + flags the archived and the long-silent.\n\nNo more manual \"when did this last update?\" hunts.\n\nThe full 8-shot list for anyone building similar tools is now in the repo (docs/marketing/iterations/v2/add-screenshot-shot-list.md). Reusable proof assets while we keep shipping.\n\nRead-only. Your data stays yours.","cta":"Open Starboard with your stars and tell me which lane surprised you most."}'

# Idea 2
fnd api POST /v1/marketing/posts --auth session --body '{"project_slug":"starboard","channel":"x","status":"generated","source_type":"task","source_id":"275d70fd-2657-4e3c-8faa-556f0342c9f3","task_id":"275d70fd-2657-4e3c-8faa-556f0342c9f3","title":"Type what you vaguely remember. Get the repo + the ones like it.","hook":"\"lightweight state management still seeing updates\" — and it just worked across my private stars.","body":"Hybrid search (lexical + 768-dim embeddings, RRF) over the exact repos you've already starred.\n\nPlus \"similar\" recommendations on the detail page so one good find surfaces the whole family.\n\nThis is one of the 8 key shots in the new Starboard screenshot library for GitHub starred repo intelligence.\n\nBuilt because my 1000+ star list had become a black hole. Read-only OAuth only.","cta":"Try a real query from your own history and send the result (good or bad)."}'

# Idea 3
fnd api POST /v1/marketing/posts --auth session --body '{"project_slug":"starboard","channel":"x","status":"generated","source_type":"task","source_id":"275d70fd-2657-4e3c-8faa-556f0342c9f3","task_id":"275d70fd-2657-4e3c-8faa-556f0342c9f3","title":"I have 1200 stars. Starboard just handed me a ready-to-ship AI stack from them.","hook":"Pick a goal. Get a curated bundle of things you already saved — with the reasoning.","body":"The stack builder + bulk list assignment + compare sheet turn the \"I meant to revisit this\" pile into deliberate collections you can actually use or share publicly.\n\nAll eight shots (radar, search, stack builder, compare, bulk, public lists, etc.) live in the new v2 shot list doc. Grab them for your own launch threads or site.\n\nThis is still early. The signals and groupings will improve with your feedback.","cta":"Try the stack builder with one of the four goals and tell me what it got right or missed."}'
```

**Environment note (same pattern as prior starboard v2 founder note):** `fnd` CLI not present in this agent's PATH (no `fnd login` session available in the execution context). Per AGENTS.md "ask before network-heavy" + Symphony scoped execution rules, the POSTs were not executed here. The exact bodies + commands above are the durable record. Operator (Sarthak) can run them from a machine with the CLI + Cockpit session, review/accept in SaaS Maker Cockpit, then mark sent after posting.

All work remains scoped, no secrets touched, no public posts performed by agent.

