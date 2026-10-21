CREATE TABLE IF NOT EXISTS scout_leads (
 id BIGSERIAL PRIMARY KEY,
 listing_type TEXT NOT NULL CHECK (listing_type IN ('rent','sale')),
 title TEXT NOT NULL,
 address TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT 'Montgomery',
 state TEXT NOT NULL DEFAULT 'AL',
 price_cents INTEGER,
 bedrooms INTEGER,
 bathrooms DOUBLE PRECISION,
 sqft INTEGER,
 source_name TEXT NOT NULL,
 source_url TEXT NOT NULL UNIQUE,
 image_url TEXT,
 source_status TEXT NOT NULL DEFAULT 'unverified',
 review_status TEXT NOT NULL DEFAULT 'needs_review' CHECK (review_status IN ('needs_review','verified','authorized','rejected','stale','published')),
 last_checked_at TIMESTAMPTZ,
 notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scout_leads_review_idx ON scout_leads (review_status, listing_type, updated_at DESC);