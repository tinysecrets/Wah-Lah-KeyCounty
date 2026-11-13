CREATE TABLE IF NOT EXISTS system_health_checks (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overall_status TEXT NOT NULL CHECK (overall_status IN ('ok','warning','critical')),
  checks JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS system_health_checks_checked_idx ON system_health_checks (checked_at DESC);

CREATE TABLE IF NOT EXISTS system_incidents (
  id BIGSERIAL PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  component TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  summary TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  occurrences INTEGER NOT NULL DEFAULT 1,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS system_incidents_status_idx ON system_incidents (status, last_seen_at DESC);