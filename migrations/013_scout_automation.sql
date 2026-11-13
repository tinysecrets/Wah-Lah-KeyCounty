ALTER TABLE scout_leads ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE scout_leads ADD COLUMN IF NOT EXISTS display_rights boolean NOT NULL DEFAULT false;
ALTER TABLE scout_leads ADD COLUMN IF NOT EXISTS source_record_id text;
ALTER TABLE scout_leads ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE homes ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS scout_sources (
  id bigserial PRIMARY KEY,
  source_name text NOT NULL,
  feed_url text NOT NULL UNIQUE,
  feed_format text NOT NULL DEFAULT 'json' CHECK (feed_format IN ('json','rss','atom')),
  enabled boolean NOT NULL DEFAULT false,
  rights_status text NOT NULL DEFAULT 'pending' CHECK (rights_status IN ('pending','display_allowed','research_only','blocked')),
  notes text NOT NULL DEFAULT '',
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scout_run_log (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  run_status text NOT NULL DEFAULT 'running',
  sources_checked integer NOT NULL DEFAULT 0,
  candidates_seen integer NOT NULL DEFAULT 0,
  candidates_added integer NOT NULL DEFAULT 0,
  candidates_updated integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS scout_sources_enabled_idx ON scout_sources (enabled, rights_status, last_checked_at);
CREATE INDEX IF NOT EXISTS scout_run_log_started_idx ON scout_run_log (started_at DESC);