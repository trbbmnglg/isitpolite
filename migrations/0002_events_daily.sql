-- Privacy-safe daily event counts (shares, saved briefings, installs, reminders,
-- instant answers). PII-FREE BY DESIGN: a row is only (UTC day, event name, count).
CREATE TABLE IF NOT EXISTS events_daily (
  day   TEXT NOT NULL,
  event TEXT NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event)
);
