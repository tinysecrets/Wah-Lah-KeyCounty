ALTER TABLE homes ADD COLUMN IF NOT EXISTS listing_status text NOT NULL DEFAULT 'available';
ALTER TABLE homes ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE homes ADD COLUMN IF NOT EXISTS status_note text;
UPDATE homes SET listing_status = CASE WHEN is_available THEN 'available' ELSE 'hidden' END WHERE listing_status = 'available' AND is_available = false;
CREATE INDEX IF NOT EXISTS homes_listing_status_idx ON homes (listing_status, is_available);