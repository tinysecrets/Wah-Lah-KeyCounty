CREATE TABLE IF NOT EXISTS settings (
 id INTEGER PRIMARY KEY,
 business_name TEXT NOT NULL DEFAULT 'Nationwide Home Rentals',
 contact_email TEXT NOT NULL DEFAULT '',
 contact_phone TEXT NOT NULL DEFAULT '',
 application_fee_cents INTEGER NOT NULL DEFAULT 3500,
 application_mode TEXT NOT NULL DEFAULT 'simplified',
 cash_app_tag TEXT NOT NULL DEFAULT '',
 venmo_handle TEXT NOT NULL DEFAULT '',
 paypal_me TEXT NOT NULL DEFAULT '',
 zelle_contact TEXT NOT NULL DEFAULT '',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)