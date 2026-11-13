ALTER TABLE listing_submissions ADD COLUMN IF NOT EXISTS listing_type TEXT NOT NULL DEFAULT 'rent';
ALTER TABLE listing_submissions ADD COLUMN IF NOT EXISTS sale_price_cents INTEGER;
ALTER TABLE listing_submissions ADD COLUMN IF NOT EXISTS submitter_attests_authorized BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS listing_submissions_listing_type_status_idx ON listing_submissions (listing_type, status, created_at DESC);