CREATE TABLE IF NOT EXISTS growth_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL,
  page_path TEXT NOT NULL DEFAULT '/',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  listing_id BIGINT,
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_events_created_event_idx ON growth_events (created_at, event_name);
CREATE INDEX IF NOT EXISTS growth_events_campaign_idx ON growth_events (utm_source, utm_medium, utm_campaign, created_at);
CREATE TABLE IF NOT EXISTS growth_pulse_log (
  id BIGSERIAL PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_status TEXT NOT NULL DEFAULT 'completed',
  inventory JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_drafts JSONB NOT NULL DEFAULT '[]'::jsonb,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_error TEXT
);
CREATE INDEX IF NOT EXISTS growth_pulse_log_ran_at_idx ON growth_pulse_log (ran_at DESC);