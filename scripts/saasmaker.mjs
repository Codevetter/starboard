/**
 * SaaS Maker auth for starboard.
 *
 * "Working auth at the very least": authenticate to the LIVE api.sassmaker.com
 * with a token, so starboard's fleet analysis can pull project/metadata from the
 * hub API (richer + live) instead of only the local foundry.projects.json file.
 * starboard runs fully standalone; auth only engages when a token is present.
 *
 * Token from env (SAASMAKER_TOKEN / SAASMAKER_SESSION_TOKEN). Self-check:
 *   node scripts/saasmaker.mjs verify
 */

const DEFAULT_BASE = "https://api.sassmaker.com";

export function resolveToken() {
  return process.env.SAASMAKER_TOKEN || process.env.SAASMAKER_SESSION_TOKEN || null;
}

export function resolveBase() {
  return process.env.SAASMAKER_BASE_URL || DEFAULT_BASE;
}

/** Confirm a token works by listing the caller's projects. */
export async function verifyAuth(token = resolveToken(), base = resolveBase()) {
  if (!token) return { ok: false, status: 0, projects: [] };
  const res = await fetch(`${base.replace(/\/+$/, "")}/v1/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { ok: false, status: res.status, projects: [] };
  const body = await res.json().catch(() => ({}));
  const arr = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
  return { ok: true, status: res.status, projects: arr.map((p) => ({ id: p.id, slug: p.slug ?? null, name: p.name })) };
}

/** Authenticated GET helper (pull fleet/project data from the hub). */
export async function getJson(path, token = resolveToken(), base = resolveBase()) {
  if (!token) throw new Error("no SaaS Maker token configured (set SAASMAKER_TOKEN)");
  const res = await fetch(`${base.replace(/\/+$/, "")}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

/** Authenticated POST helper (push recommendation events / enqueue tasks). */
export async function postJson(path, payload, token = resolveToken(), base = resolveBase()) {
  if (!token) throw new Error("no SaaS Maker token configured (set SAASMAKER_TOKEN)");
  const res = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

if (process.argv[2] === "verify") {
  if (!resolveToken()) { console.log("Not connected. Set SAASMAKER_TOKEN to pull live fleet data."); process.exit(0); }
  const v = await verifyAuth();
  if (v.ok) console.log(`✓ Connected to SaaS Maker — ${v.projects.length} project(s) visible.`);
  else { console.error(`Auth check failed (status ${v.status}). Token may be invalid.`); process.exit(1); }
}
