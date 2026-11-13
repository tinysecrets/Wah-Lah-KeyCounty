CREATE TABLE IF NOT EXISTS area_search_leads (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  requested_area TEXT NOT NULL,
  listing_type TEXT NOT NULL DEFAULT 'all' CHECK (listing_type IN ('all','rent','sale')),
  max_price_cents INTEGER CHECK (max_price_cents IS NULL OR max_price_cents >= 0),
  min_bedrooms INTEGER CHECK (min_bedrooms IS NULL OR (min_bedrooms >= 0 AND min_bedrooms <= 20)),
  message TEXT NOT NULL DEFAULT '',
  consent_to_contact BOOLEAN NOT NULL DEFAULT FALSE CHECK (consent_to_contact = TRUE),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','matched','closed')),
  admin_notes TEXT NOT NULL DEFAULT '',
  contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS area_search_leads_status_created_idx
  ON area_search_leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS area_search_leads_email_created_idx
  ON area_search_leads (lower(email), created_at DESC);