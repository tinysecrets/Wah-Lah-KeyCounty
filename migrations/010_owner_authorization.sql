ALTER TABLE homes ADD COLUMN IF NOT EXISTS owner_authorized BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE homes ADD COLUMN IF NOT EXISTS authorization_note TEXT;
ALTER TABLE homes ADD COLUMN IF NOT EXISTS owner_authorized_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS homes_public_authorized_idx ON homes (owner_authorized, listing_status, is_available);
UPDATE homes
SET is_available = FALSE,
    listing_status = CASE WHEN listing_status = 'available' THEN 'hidden' ELSE listing_status END,
    status_updated_at = now()
WHERE owner_authorized = FALSE AND is_available = TRUE;