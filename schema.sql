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
