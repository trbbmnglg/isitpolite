-- IsItPolite community data — PII-FREE BY DESIGN.
-- No IPs, no user identifiers, no raw free-text. Only verdict keys, aggregate
-- counts, AI-sanitized summaries, and coarse (day-level) dates.

CREATE TABLE IF NOT EXISTS verdicts (
  vkey          TEXT PRIMARY KEY,          -- normalized gesture|country|context
  gesture       TEXT NOT NULL,
  country       TEXT NOT NULL,
  context       TEXT NOT NULL,
  confirm_count INTEGER NOT NULL DEFAULT 0, -- "this is accurate" confirmations
  dispute_count INTEGER NOT NULL DEFAULT 0, -- corroborated inaccuracy reports
  pending_count INTEGER NOT NULL DEFAULT 0, -- AI-accepted disputes awaiting corroboration
  updated_at    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  vkey        TEXT NOT NULL,
  kind        TEXT NOT NULL,               -- 'confirm' | 'dispute'
  status      TEXT NOT NULL,               -- 'accepted' | 'promoted'
  summary     TEXT,                        -- AI-sanitized, PII-stripped (disputes only)
  created_day TEXT NOT NULL                -- 'YYYY-MM-DD' (coarse, non-identifying)
);
CREATE INDEX IF NOT EXISTS idx_reports_vkey ON reports(vkey);

CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  summary     TEXT NOT NULL,               -- AI-sanitized, PII-stripped
  sentiment   TEXT,                        -- 'positive' | 'neutral' | 'negative'
  created_day TEXT NOT NULL
);

-- Internal config (e.g. the random rate-limit salt). No user data.
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);

-- Rate-limit buckets. Stores ONLY name:SHA256(ip+secret_salt):window — an
-- irreversible, salted token (never the IP). Rows auto-purge within minutes.
CREATE TABLE IF NOT EXISTS rate (
  bucket       TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

-- ── Premium unlock codes (PII-FREE BY DESIGN) ──────────────────────────────
-- Stores ONLY: a random code, two credit pools, an opaque PayPal capture id,
-- and a coarse day. No buyer name / email / card / PayPal-id is ever persisted.
--
-- Two-currency design (v2):
--   search_total/search_used  — lookup credits granted by a pack
--   gen_total/gen_used        — generation credits granted by a pack
--   credits_total/credits_used — LEGACY (kept inert for old $2.99 codes; do not drop)
--
-- LIVE MIGRATION (run ONCE against the existing DB, then never again):
--   ALTER TABLE licenses ADD COLUMN search_total INTEGER NOT NULL DEFAULT 0;
--   ALTER TABLE licenses ADD COLUMN search_used  INTEGER NOT NULL DEFAULT 0;
--   ALTER TABLE licenses ADD COLUMN gen_total    INTEGER NOT NULL DEFAULT 0;
--   ALTER TABLE licenses ADD COLUMN gen_used     INTEGER NOT NULL DEFAULT 0;
--   UPDATE licenses SET gen_total = credits_total, gen_used = credits_used
--    WHERE gen_total = 0 AND gen_used = 0 AND (credits_total > 0 OR credits_used > 0);
--
-- Never commit a working unlock code (test or otherwise) — this repo is public.
-- Apply schema to a FRESH DB with:
--   npx wrangler d1 execute isitpolite-db --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS licenses (
  code          TEXT PRIMARY KEY,             -- XXXX-XXXX-XXXX-XXXX (Crockford base32, ~80 bits)
  credits_total INTEGER NOT NULL DEFAULT 5,   -- LEGACY — kept inert; use gen_total for new mints
  credits_used  INTEGER NOT NULL DEFAULT 0,   -- LEGACY — kept inert; use gen_used for new mints
  search_total  INTEGER NOT NULL DEFAULT 0,   -- paid lookup credits granted by pack
  search_used   INTEGER NOT NULL DEFAULT 0,
  gen_total     INTEGER NOT NULL DEFAULT 0,   -- paid generation credits granted by pack
  gen_used      INTEGER NOT NULL DEFAULT 0,
  order_ref     TEXT UNIQUE,                  -- PayPal capture id — idempotency key only (no PII)
  created_day   TEXT NOT NULL                 -- YYYY-MM-DD (coarse, non-identifying)
);
CREATE INDEX IF NOT EXISTS idx_licenses_order ON licenses(order_ref);

-- PayPal webhook event deduplication — prevents double-granting on replay.
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id    TEXT PRIMARY KEY,
  created_day TEXT NOT NULL
);

-- Aggregate daily counts of answered lookups by mode (no identifiers).
-- Added to the live DB via migrations/0001_usage_daily.sql.
CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT NOT NULL,            -- UTC 'YYYY-MM-DD'
  mode TEXT NOT NULL,           -- check | compare | trip | guide | quiz
  answered INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, mode)
);
