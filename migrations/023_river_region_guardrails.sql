-- STAGED ONLY: do not execute until the shared-database cutover is explicitly authorized.
-- River Region publication requires independently verified source display rights,
-- owner authorization, and Census street-address county resolution.
ALTER TABLE homes
  ADD COLUMN IF NOT EXISTS county VARCHAR(64),
  ADD COLUMN IF NOT EXISTS county_fips CHAR(5),
  ADD COLUMN IF NOT EXISTS display_rights BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_status VARCHAR(64) NOT NULL DEFAULT 'pending_verification';

ALTER TABLE scout_leads
  ADD COLUMN IF NOT EXISTS county VARCHAR(64),
  ADD COLUMN IF NOT EXISTS county_fips CHAR(5),
  ADD COLUMN IF NOT EXISTS county_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS owner_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS owner_authorization_reference TEXT,
  ADD COLUMN IF NOT EXISTS owner_authorized_at TIMESTAMPTZ;

ALTER TABLE scout_sources
  ADD COLUMN IF NOT EXISTS consecutive_feed_errors INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_http_status INTEGER;

CREATE TABLE IF NOT EXISTS review_audits (
  id BIGSERIAL PRIMARY KEY,
  target_type VARCHAR(32) NOT NULL,
  target_id BIGINT NOT NULL,
  reviewer_model VARCHAR(128) NOT NULL,
  decision VARCHAR(24) NOT NULL CHECK (decision IN ('approved','rejected','held')),
  county_fips CHAR(5),
  display_rights_verified BOOLEAN NOT NULL,
  owner_authorized_verified BOOLEAN NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

UPDATE homes
SET is_available=FALSE,
    listing_status=CASE WHEN listing_status='available' THEN 'hidden' ELSE listing_status END,
    source_status='quarantined_out_of_region_or_unverified',
    status_note='Hidden pending independent display-rights, owner-authorization, and street-address county verification.',
    status_updated_at=NOW()
WHERE is_available=TRUE
  AND (
    UPPER(COALESCE(state,'')) <> 'AL'
    OR county_fips IS NULL
    OR county_fips NOT IN ('01001','01051','01085','01101')
    OR display_rights IS NOT TRUE
    OR owner_authorized IS NOT TRUE
  );

ALTER TABLE homes DROP CONSTRAINT IF EXISTS chk_homes_river_region_available;
ALTER TABLE homes ADD CONSTRAINT chk_homes_river_region_available CHECK (
  is_available=FALSE OR (
    UPPER(state)='AL'
    AND county_fips IN ('01001','01051','01085','01101')
    AND display_rights=TRUE
    AND owner_authorized=TRUE
  )
);
CREATE OR REPLACE FUNCTION prevent_review_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'review_audits is append-only';
END;
$$;
DROP TRIGGER IF EXISTS review_audits_append_only ON review_audits;
CREATE TRIGGER review_audits_append_only
  BEFORE UPDATE OR DELETE ON review_audits
  FOR EACH ROW EXECUTE FUNCTION prevent_review_audit_mutation();

CREATE INDEX IF NOT EXISTS homes_river_region_public_idx
  ON homes (county_fips,is_available,listing_status)
  WHERE is_available=TRUE;