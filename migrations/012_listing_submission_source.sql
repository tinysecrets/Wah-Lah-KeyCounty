ALTER TABLE listing_submissions ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT '';
ALTER TABLE listing_submissions ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS listing_submissions_source_url_idx ON listing_submissions(source_url);