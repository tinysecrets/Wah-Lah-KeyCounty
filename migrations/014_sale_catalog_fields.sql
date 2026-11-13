ALTER TABLE scout_leads ADD COLUMN IF NOT EXISTS property_type text NOT NULL DEFAULT 'house';
ALTER TABLE homes ADD COLUMN IF NOT EXISTS listing_type text NOT NULL DEFAULT 'rent';
ALTER TABLE homes ADD COLUMN IF NOT EXISTS sale_price_cents integer;

CREATE INDEX IF NOT EXISTS homes_listing_type_status_idx ON homes (listing_type, is_available, listing_status);