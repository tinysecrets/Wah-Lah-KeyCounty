CREATE TABLE IF NOT EXISTS listing_submissions (
 id BIGSERIAL PRIMARY KEY,
 owner_name TEXT NOT NULL,
 owner_email TEXT NOT NULL,
 owner_phone TEXT NOT NULL DEFAULT '',
 property_title TEXT NOT NULL,
 address TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT 'Montgomery',
 state TEXT NOT NULL DEFAULT 'AL',
 zip TEXT NOT NULL DEFAULT '',
 monthly_rent_cents INTEGER,
 bedrooms INTEGER,
 bathrooms DOUBLE PRECISION,
 sqft INTEGER,
 description TEXT NOT NULL DEFAULT '',
 photo_data JSONB NOT NULL DEFAULT '[]'::jsonb,
 status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','contacted','approved','rejected')),
 owner_authorization BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_submissions_status_idx ON listing_submissions(status,created_at DESC);