CREATE TABLE IF NOT EXISTS payment_audit_log (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('manual_received','provider_confirmed','reversal')),
  payment_method TEXT NOT NULL,
  payment_reference TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  recorded_by TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_audit_log_application_idx ON payment_audit_log (application_id, created_at DESC);