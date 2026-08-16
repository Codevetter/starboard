-- Need-driven project intelligence: capability cards, project fingerprints,
-- needs, candidate pools, draft reports, reviewed reports, and external review
-- requests. All tables are additive — the existing project recommendation path
-- keeps working unchanged.

-- Reusable, evidence-backed repository capability card. One row per catalog
-- repository. Refreshed only when the source fingerprint changes.
CREATE TABLE IF NOT EXISTS repo_capability_cards (
  repo_id           INTEGER PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
  source_fingerprint TEXT NOT NULL,
  purpose           TEXT NOT NULL,
  capabilities      TEXT NOT NULL DEFAULT '[]',
  language          TEXT,
  tools             TEXT NOT NULL DEFAULT '[]',
  adoption_type     TEXT,
  maintenance       TEXT NOT NULL DEFAULT '{}',
  embedding_refs    TEXT NOT NULL DEFAULT '[]',
  provenance        TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_repo_capability_cards_fingerprint
  ON repo_capability_cards(source_fingerprint);

-- Stable project fingerprint from approved evidence. One row per connected
-- project (repo_id). Reused to gate need-map recomputation.
CREATE TABLE IF NOT EXISTS project_fingerprints (
  repo_id    INTEGER PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  evidence   TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Extracted project needs with stable ids, priority, constraints, evidence,
-- normalized signatures, and search intents. Cached per fingerprint.
CREATE TABLE IF NOT EXISTS project_needs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id         INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  need_id         TEXT NOT NULL,
  title           TEXT NOT NULL,
  current_state   TEXT NOT NULL,
  desired_outcome TEXT NOT NULL,
  priority        TEXT NOT NULL CHECK(priority IN ('high', 'medium', 'low')),
  constraints     TEXT NOT NULL DEFAULT '[]',
  evidence        TEXT NOT NULL DEFAULT '[]',
  search_intents  TEXT NOT NULL DEFAULT '[]',
  signature       TEXT NOT NULL,
  fingerprint     TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(repo_id, need_id)
);

CREATE INDEX IF NOT EXISTS idx_project_needs_repo ON project_needs(repo_id);
CREATE INDEX IF NOT EXISTS idx_project_needs_signature ON project_needs(signature);
CREATE INDEX IF NOT EXISTS idx_project_needs_fingerprint ON project_needs(fingerprint);

-- Reusable candidate pool keyed by need signature, project constraints,
-- retrieval version, and catalog generation. Shared across projects with
-- similar needs.
CREATE TABLE IF NOT EXISTS need_candidate_pools (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  signature         TEXT NOT NULL,
  retrieval_version TEXT NOT NULL,
  catalog_generation TEXT NOT NULL,
  constraints_hash  TEXT NOT NULL,
  candidate_ids     TEXT NOT NULL DEFAULT '[]',
  candidate_count   INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(signature, retrieval_version, catalog_generation, constraints_hash)
);

CREATE INDEX IF NOT EXISTS idx_need_candidate_pools_signature
  ON need_candidate_pools(signature);

-- Deterministic draft report grouped by need with version, catalog generation,
-- and provenance. One latest row per project.
CREATE TABLE IF NOT EXISTS project_draft_reports (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id           INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  fingerprint       TEXT NOT NULL,
  catalog_generation TEXT NOT NULL,
  retrieval_version TEXT NOT NULL,
  status            TEXT NOT NULL CHECK(status IN ('pending', 'retrieving', 'complete', 'degraded', 'failed')),
  report            TEXT NOT NULL,
  needs_count       INTEGER NOT NULL DEFAULT 0,
  candidates_count  INTEGER NOT NULL DEFAULT 0,
  provenance        TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  is_latest         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_project_draft_reports_repo_latest
  ON project_draft_reports(repo_id, is_latest DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_draft_reports_status
  ON project_draft_reports(status);

-- External review request with idempotency key, status, request payload hash,
-- and result schema. Provider-neutral — Devin credentials live outside
-- Starboard.
CREATE TABLE IF NOT EXISTS external_review_requests (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key   TEXT NOT NULL UNIQUE,
  repo_id           INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  draft_report_id   INTEGER NOT NULL REFERENCES project_draft_reports(id) ON DELETE CASCADE,
  request_hash      TEXT NOT NULL,
  status            TEXT NOT NULL CHECK(status IN ('pending', 'submitted', 'complete', 'rejected', 'failed', 'timeout')),
  result            TEXT,
  reviewer_provider TEXT,
  reviewer_model    TEXT,
  reviewer_usage    TEXT NOT NULL DEFAULT '{}',
  error             TEXT,
  submitted_at      TEXT,
  completed_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_external_review_requests_repo
  ON external_review_requests(repo_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_review_requests_status
  ON external_review_requests(status);
CREATE INDEX IF NOT EXISTS idx_external_review_requests_idempotency
  ON external_review_requests(idempotency_key);

-- Final reviewed report after external review ingestion. One latest row per
-- project. The deterministic draft remains as fallback.
CREATE TABLE IF NOT EXISTS project_reviewed_reports (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id           INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  draft_report_id   INTEGER NOT NULL REFERENCES project_draft_reports(id) ON DELETE CASCADE,
  review_request_id INTEGER REFERENCES external_review_requests(id) ON DELETE SET NULL,
  status            TEXT NOT NULL CHECK(status IN ('pending', 'awaiting_review', 'complete', 'degraded', 'failed')),
  report            TEXT NOT NULL,
  reviewer_provider TEXT,
  reviewer_model    TEXT,
  reviewer_usage    TEXT NOT NULL DEFAULT '{}',
  provenance        TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  is_latest         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_project_reviewed_reports_repo_latest
  ON project_reviewed_reports(repo_id, is_latest DESC, created_at DESC);
