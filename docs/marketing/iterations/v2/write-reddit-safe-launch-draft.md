# Reddit-Safe Launch Draft for Starboard v2 — GitHub Starred Repo Intelligence

**Subreddit targets (suggested, post only where on-topic):** r/github, r/selfhosted (for the local-first angle if relevant), r/productivity, r/IndieHackers, r/SaaS, r/OpenSource (value-first cross-posts only after genuine engagement).

**Tone rule:** Non-spammy, problem-first, specific signals, explicit disclosure, concrete feedback asks. No "revolutionary AI", no "never miss another star again" hype. Read-only trust emphasized everywhere.

---

## Post Title Options

- **Option 1 (Pain + Specific Tool):** After 800+ GitHub stars the list became useless. I built a read-only layer that surfaces releases, momentum, and the ones going stale.
- **Option 2 (Search Angle):** "Find that one Go HTTP library I starred last year that was still getting updates" — I built hybrid semantic + lexical search over my own stars (and a seeded popular set).
- **Option 3 (Radar / Weekly Intelligence):** GitHub stars are intent signals with zero memory. Here's the weekly radar + stale-cleanup pass I built for my own list.

---

## Post Body (use/adapt one primary; keep under ~400-500 words for Reddit)

Hey r/github (or appropriate sub),

I've been starring repos on GitHub for years. The list grew into the hundreds, then low thousands. GitHub's native stars page is a flat reverse-chronological dump — no useful search, no memory of *why* I saved something, no signal on which ones shipped recently or went quiet.

Most of my stars just sat there. I wanted a private, read-only "second brain" that watches the actual signals (recent releases, activity velocity, maintenance gaps, archive status) and tells me which handful are worth a look this week.

### What Starboard does (no magic claims)

- **Read-only GitHub OAuth sync** of your starred repos + any star lists you've created on GitHub. It never stars, unstars, or writes anything back. Revoke the token anytime in GitHub settings.
- **Hybrid search** over your own library: lexical (FTS5 on name/desc/topics) + semantic similarity via 768-dim embeddings (bge model) with reciprocal rank fusion. Type things like "lightweight state management still seeing updates" or "Go HTTP libs with recent commits" and it blends your stars with a small seeded set of popular public repos for discovery.
- **Radar / signals** that buckets repos weekly: new releases or activity, high-momentum (star delta + commits), at-risk/stale (long silent, archived, or no movement), plus simple keep/revisit/remove nudges. There's a sample stale cleanup view and weekly digest previews on the landing page.
- **Tags, collections (shareable public lists), bulk actions, side-by-side compare.** Tags can be suggested from repo metadata.
- **Public discover page** with embeddings over popular seeded repos (5k+ stars floor via daily GitHub Action) so you can find relevant things even before starring.

It's not a starring service and it doesn't replace GitHub's star button. It's the retrieval + signal layer on top of the list you already have.

### Demo

Live: https://starboard.sarthakagrawal927.workers.dev

Sign in with GitHub (read-only scopes only — the exact scopes are shown). Your stars sync (ETag cached), the current week's radar applies, and you can try semantic queries immediately. No credit card, core features free. There's also a public discover mode without signing in.

Screenshots and live samples of the radar, stale cleanup, and weekly digest previews are on the landing page.

### What feedback I'm looking for right now

This is early. Honest signal on whether the intelligence is actually useful:

- Search quality: Do the hybrid results feel relevant for real queries against your own stars? Where does it miss (false positives/negatives)?
- Radar verdicts: Are the release / momentum / at-risk buckets directionally correct for repos you know? Any key signals missing (e.g. specific release types, contributor velocity)?
- Stale cleanup / weekly digest: Does the "keep or prune" framing or the digest format reduce noise for you, or does it add another thing to check?
- Overall: After connecting your stars, do you find yourself acting on 3-5 repos per week that you otherwise would have missed? What's the smallest change that would make this a default tab for you?

### Disclosure

I'm the solo developer (with heavy AI assistance on implementation per the project's own README). Starboard is a personal tool I built because my own star list had become a black hole. It's deployed on Cloudflare Workers + Turso, uses Cloudflare Workers AI for embeddings, and the source is public at https://github.com/sarthak-fleet/starboard (or current repo).

Core sync + search + radar is free. There are previews of deeper paid weekly action digests in the UI. No dark patterns, no "growth hacks."

If this resonates with how your starred repos have grown unmanageable, try it with a real account and reply with the specific queries or repos where the signals were right or wrong. That's the input that will shape the next iterations.

Thanks for reading — happy to answer questions in comments.

---

## Notes for this v2 iteration (internal)

- **Prior related asset:** `docs/marketing/iterations/v2/write-founder-launch-note.md` (already present in this repo under the same v2/ directory). It covers founder voice on the "GitHub starred repo intelligence" positioning, radar, hybrid search, read-only emphasis, and includes 3 proposed X post JSON bodies for an earlier task ID (4ab727ff-...). This reddit draft is complementary — more community-oriented, longer-form, subreddit-safe, with explicit feedback vectors and disclosure. No first-pass `docs/marketing/reddit-launch.md` existed to overwrite; the task instruction directed v2 location for iteration hygiene.
- **Patterns followed:** Modeled directly on `swe-interview-prep/docs/marketing/iterations/v2/write-reddit-safe-launch-draft.md` (title options, structured body with "What it does", "I'd love your feedback", "Disclosure" sections, non-hype tone). Also cross-referenced the founder v2 note and current product surfaces (landing hero, about page, sample components for radar/digest/stale-cleanup, src/lib/maintainer-digest.ts, radar route, discover page, embeddings contract).
- **Key positioning for this draft:** "GitHub starred repo intelligence" (radar + actionable signals + hybrid retrieval over personal stars + seeded discovery). Emphasizes read-only trust, specific technical details (ETag, RRF, 768-dim, daily seed Action) without overclaiming, and measurable feedback asks.
- **Supporting context:** See also README "Product Shape", src/app/about/page.tsx (What it does / What it isn't), landing page copy on "Know which of your GitHub stars matter right now", and the SaaS Maker widgets integrated for feedback loop.
- **Marketing Queue requirement:** Per task contract, the *required* output is one or more SaaS Maker Marketing Queue items created via `fnd api POST /v1/marketing/posts` (channel "x", status "generated", source tied to this task ID 843afea3-83a9-4522-9226-df88ab52a1d5). The repo .md is optional supporting note only. See the "Proposed Queue Ideas" section below for the exact payloads prepared for this task.

---

## Proposed SaaS Maker Marketing Queue Ideas (X channel, v2 reddit-safe framing)

These are short, plain, non-spammy X-style posts distilled from the Reddit draft above. They are safe to cross-promote thoughtful discussion. All reference the current task.

**Common fields for all:**
- project_slug: "starboard"
- channel: "x"
- status: "generated"
- source_type: "task"
- source_id: "843afea3-83a9-4522-9226-df88ab52a1d5"
- task_id: "843afea3-83a9-4522-9226-df88ab52a1d5"

### Idea 1: Radar / Weekly Signals (core intelligence hook)
```json
{
  "project_slug": "starboard",
  "channel": "x",
  "status": "generated",
  "source_type": "task",
  "source_id": "843afea3-83a9-4522-9226-df88ab52a1d5",
  "task_id": "843afea3-83a9-4522-9226-df88ab52a1d5",
  "title": "My GitHub stars turned into noise. Built a weekly radar.",
  "hook": "GitHub stars are intent signals with zero memory of why you saved them or what's moving.",
  "body": "After starring 800+ repos the flat list became useless. I built Starboard (read-only) to sync stars and bucket them by real signals each week: recent releases, momentum, at-risk/stale (archived or long silent), plus simple keep/revisit nudges.\n\nHybrid search too (lexical + embeddings over your own stars + seeded popular set).\n\nLive: https://starboard.sarthakagrawal927.workers.dev\n\nFeedback on the signals wanted — especially false positives on 'stale'.",
  "cta": "Try it with your stars and send feedback."
}
```

### Idea 2: Semantic search over *your* stars (not another public search)
```json
{
  "project_slug": "starboard",
  "channel": "x",
  "status": "generated",
  "source_type": "task",
  "source_id": "843afea3-83a9-4522-9226-df88ab52a1d5",
  "task_id": "843afea3-83a9-4522-9226-df88ab52a1d5",
  "title": "Semantic search that only looks at repos *you've* already starred",
  "hook": "Not another GitHub search. Private retrieval for the repos you already saved but can never find again.",
  "body": "I wanted to ask 'lightweight state management still seeing updates' or 'Go HTTP libs with recent activity' and actually surface things from my own star list.\n\nStarboard does hybrid search (FTS5 + 768-dim bge embeddings, RRF) over your stars + a small seeded discovery set of popular repos. Read-only OAuth. No training on your data.\n\nEarly. Real queries that work or fail will shape it.\n\nLive now.",
  "cta": "Try Starboard and send the queries that succeeded or failed."
}
```

### Idea 3: Stale cleanup as proof of useful intelligence (actionable, low-noise)
```json
{
  "project_slug": "starboard",
  "channel": "x",
  "status": "generated",
  "source_type": "task",
  "source_id": "843afea3-83a9-4522-9226-df88ab52a1d5",
  "task_id": "843afea3-83a9-4522-9226-df88ab52a1d5",
  "title": "The 'should I keep this star?' signal for a 1000+ repo list",
  "hook": "Cleanup used to mean hours of tab hunting. Now it's a short, signal-driven pass.",
  "body": "Starboard watches last activity, archive status, recent star delta, and your own tags/notes. Surfaces at-risk items with a keep/revisit/remove nudge.\n\nIt's the thin intelligence layer on top of normal GitHub stars (read-only, revocable). Goal: turn a growing archive into a handful of real decisions per week.\n\nNo hype. Just the signals I wanted for my own list.\n\nLive + feedback on the verdicts especially useful.",
  "cta": "Try it and send feedback."
}
```

---

**Execution note (per Symphony contract):** The required deliverable is creation of the above (or similar) queue items via the exact `fnd api POST /v1/marketing/posts --auth session --body '...' ` command (one per idea). Repo docs support only. After creation, run the `pnpm --dir ~/Desktop/fleet/saas-maker symphony done 843afea3-83a9-4522-9226-df88ab52a1d5` to close the task (auto-creates changelog draft if type qualifies).

Per fleet AGENTS.md and this repo's agents.md: ask before network-heavy commands. The fnd invocation, auth context, and API base (current local shell config points to localhost:8787; prod requires override or proper `fnd login`) must be confirmed by the operator before any POST or symphony done call. No secrets were read or written. No public posting performed.

All work kept strictly to the task scope.
