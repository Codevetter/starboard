# Founder's Note v2: GitHub starred repo intelligence

I've been starring repos on GitHub for years. The list grew into the hundreds, then thousands. Most of them just... sat there. GitHub gives you a reverse-chronological dump and very little else. Finding the one thing you vaguely remembered starring six months ago is painful. Knowing which of your stars shipped something this week is basically impossible without manual checking.

Starboard is the thin intelligence layer I built on top of that list.

**Quick personal note on the problem**

- Your stars are intent signals, but the native UI treats them as a bookmark folder with no search that matters and no memory of why you saved something.
- Over time the noise drowns the signal: active projects, quiet but important ones, and the ones that went dark all look the same.
- I wanted a private, read-only system that watches the signals (recent activity, releases, star velocity, maintenance gaps) and surfaces the small set of repos worth my attention this week.

**What it actually does (no overclaims)**

- Read-only GitHub OAuth sync of your starred repos + your star lists. We never star or unstar anything for you.
- A "radar" that buckets your library into useful groups each week: newly added, recent releases/activity, high-momentum, at-risk/stale (including archived or long-dormant), plus suggested small actions like "add a note" or "assign to a collection."
- Hybrid search: full-text plus semantic similarity over embeddings (768-dim bge model, RRF fusion). Ask in plain language across your own stars and a seeded set of popular repos.
- Tags, collections (public shareable lists), bulk organization, and side-by-side compare.
- Weekly digest previews (free signals today, deeper paid action digests in progress).

It's not a replacement for GitHub stars. It's a second brain that tells you which of the things you already starred are doing something worth your time.

**Demo (v2 note)**

Connect GitHub (read-only scopes only — revoke anytime). Your stars load with the current week's radar applied. Try a semantic query like "lightweight state management still seeing updates" or filter to languages + tags. The stale cleanup sample shows the kind of "keep or prune" signal we generate from last-activity + archive status + star delta.

Live: https://starboard.sarthakagrawal927.workers.dev (or the current workers.dev URL in README).

**CTA**

If your GitHub stars have become a growing, unsearchable list and you'd like a private layer that surfaces what's actually moving, try Starboard and tell me what signals are missing or wrong.

Feedback on the radar groupings, search quality, or the direction of the weekly digest is especially welcome right now. This is still early — the goal is repeatable, low-noise intelligence you actually act on, not another dashboard.

— Sarthak

---

**Notes for this v2 iteration (internal)**

- Prior v1 founder launch note asset: not present in this repo's docs/marketing (no first-pass file existed to overwrite). Similar v2 patterns exist in sibling fleet projects (e.g. swe-interview-prep/docs/marketing/iterations/v2/write-founder-launch-note.md). Any v1 positioning or earlier drafts live in SaaS Maker Cockpit task history or prior Symphony runs for starboard marketing.
- This v2 focuses on "GitHub starred repo intelligence" (radar + signals + actionable digests + hybrid search) per the current task description and product state as of late May 2026.
- Tone: personal founder voice, short, specific problem + honest capabilities, clear CTA for feedback. No overclaims on "AI magic" or scale. Read-only trust emphasized.
- Supporting: see also landing page hero copy, src/app/about/page.tsx (What it is / What it isn't), lib/maintainer-digest.ts for the actual grouping logic, and the sample components in the marketing previews on /.

## Proposed SaaS Maker Marketing Queue Ideas (v2)

These are the exact ideas prepared for direct creation in the SaaS Maker Marketing Queue via `fnd api POST /v1/marketing/posts` (per Symphony contract for this task). Repo docs are supporting notes; the queue entries are the system of record for review/posting.

**All use:**
- project_slug: "starboard"
- channel: "x"
- status: "generated"
- source_type: "task"
- source_id / task_id: "4ab727ff-b5b3-48a6-9d61-f59f6482c46e"

### Idea 1: Radar / Weekly Intelligence (founder pain + signals)
```json
{
  "project_slug": "starboard",
  "channel": "x",
  "status": "generated",
  "source_type": "task",
  "source_id": "4ab727ff-b5b3-48a6-9d61-f59f6482c46e",
  "task_id": "4ab727ff-b5b3-48a6-9d61-f59f6482c46e",
  "title": "My stars became noise. The weekly radar I built.",
  "hook": "GitHub stars are great until you have 800 of them and no way to know what's moving.",
  "body": "I've starred hundreds of repos. Most disappeared into the list. New releases, dead projects, and the one thing I meant to revisit all looked identical.\n\nStarboard (read-only) syncs your stars and buckets them weekly: recent releases, high-momentum, at-risk/stale (archived or long silent), plus suggested actions.\n\nHybrid semantic search over your own library too.\n\nLive now. Built because my own list had become useless.\n\nFeedback on the signals wanted.",
  "cta": "Try it with your stars and send feedback on what actually helps."
}
```

### Idea 2: Semantic search over personal stars (not public web)
```json
{
  "project_slug": "starboard",
  "channel": "x",
  "status": "generated",
  "source_type": "task",
  "source_id": "4ab727ff-b5b3-48a6-9d61-f59f6482c46e",
  "task_id": "4ab727ff-b5b3-48a6-9d61-f59f6482c46e",
  "title": "Semantic search across *your own* GitHub stars",
  "hook": "Not another public GitHub search. Private intelligence for what you've already saved.",
  "body": "I wanted to type 'lightweight state management still seeing updates' or 'Go HTTP libs with recent releases' and surface relevant things from my own star list — plus similar popular repos via embeddings.\n\nStarboard does hybrid search (FTS5 + 768-dim bge embeddings, RRF fusion) over your stars + seeded discovery set. Read-only. No training on your data.\n\nEarly. Real queries that work or fail will shape it.\n\nTry it and tell me.",
  "cta": "Try Starboard and send the queries that succeeded or failed."
}
```

### Idea 3: Stale cleanup / actionable at-risk (proof of intelligence)
```json
{
  "project_slug": "starboard",
  "channel": "x",
  "status": "generated",
  "source_type": "task",
  "source_id": "4ab727ff-b5b3-48a6-9d61-f59f6482c46e",
  "task_id": "4ab727ff-b5b3-48a6-9d61-f59f6482c46e",
  "title": "The 'should I keep this star?' signal for 1000+ repos",
  "hook": "Cleanup used to take hours of tab hunting. Now it's a short pass.",
  "body": "Starboard watches last update, archive status, 7-day star delta, and whether you've tagged or noted a repo. It surfaces at-risk items with a simple keep/revisit/remove nudge.\n\nIt's the layer on top of GitHub stars (read-only OAuth, revocable). The goal: turn a growing archive into a small set of decisions you can actually make each week.\n\nNo magic. Just the signals I wished I had for my own list.\n\nLive. Feedback on the verdicts especially useful.",
  "cta": "Try it and send feedback."
}
```

**Next step (environment blocker — see report):** The `fnd` CLI (SaaS Maker local tool) is not present in the current agent execution PATH and requires prior `fnd login` + session on the operator machine. Per AGENTS.md rule to ask before network-heavy commands + hard blocker rule for missing local tooling, the POSTs were not executed here.

Exact JSON bodies for the 3 ideas are captured above — copy and run the `fnd api POST` commands manually on a machine where `fnd` is installed and authenticated:

```bash
fnd api POST /v1/marketing/posts --auth session --body '{ "project_slug": "starboard", ... full body from Idea 1 ... }'
# repeat for 2 and 3
```

Then mark complete (after you review/accept in Cockpit or manually):

```bash
pnpm --dir ~/Desktop/fleet/saas-maker symphony done 4ab727ff-b5b3-48a6-9d61-f59f6482c46e
```

All local work scoped to the task is complete and verified. No secrets, no deploys, no public posts performed.
