CREATE TABLE IF NOT EXISTS connection_requests (
  id BIGSERIAL PRIMARY KEY,
  reference_code TEXT NOT NULL UNIQUE,
  home_id BIGINT NOT NULL REFERENCES homes(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  preferred_contact TEXT NOT NULL DEFAULT 'email' CHECK (preferred_contact IN ('email','phone')),
  message TEXT NOT NULL DEFAULT '',
  fee_cents INTEGER NOT NULL CHECK (fee_cents >= 0),
  status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','paid','contacted','completed','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','disputed')),
  payment_method TEXT,
  payment_reference TEXT,
  stripe_session_id TEXT,
  paid_at TIMESTAMPTZ,
  admin_notified_at TIMESTAMPTZ,
  fulfillment_status TEXT NOT NULL DEFAULT 'needs_follow_up' CHECK (fulfillment_status IN ('needs_follow_up','in_progress','completed','unable_to_connect')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connection_requests_status_created_idx ON connection_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS connection_requests_home_created_idx ON connection_requests (home_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS connection_requests_stripe_session_unique ON connection_requests (stripe_session_id) WHERE stripe_session_id IS NOT NULL;