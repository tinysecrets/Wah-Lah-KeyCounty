ALTER TABLE applications ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'not_settled';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS settlement_reference TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS payout_recipient TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS payout_reference TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS payout_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS applications_payment_lifecycle_idx ON applications (payment_status, settlement_status, payout_status);