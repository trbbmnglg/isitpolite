-- Privacy-safe usage counter — PII-FREE BY DESIGN.
-- One row per (UTC day, lookup mode) holding an aggregate count of answered
-- /api/lookup checks. No IPs or hashes, no user agents, no visitor country,
-- no gesture or request text — only the date and the mode.
--
-- Apply (remote, this file only):
--   npx wrangler d1 execute isitpolite-db --remote --file=migrations/0001_usage_daily.sql
CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT NOT NULL,            -- UTC 'YYYY-MM-DD'
  mode TEXT NOT NULL,           -- check | compare | trip | guide | quiz
  answered INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, mode)
);
