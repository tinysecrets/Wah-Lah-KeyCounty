import { db } from "hatchable";
export const access = "admin";
export const methods = ["GET", "POST"];

const clean = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const integerId = v => Number.isInteger(Number(v)) && Number(v) > 0;

export default async function (req, res) {
  if (req.method === "GET") {
    const [stats, apps, homes, settings] = await Promise.all([
      db.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE status IN ('under_review','awaiting_payment'))::int AS review, count(*) FILTER (WHERE payment_status IN ('captured','paid'))::int AS paid, count(*) FILTER (WHERE payment_status='manual_received')::int AS manually_received, count(*) FILTER (WHERE settlement_status='settled')::int AS settled, count(*) FILTER (WHERE payout_status='captured')::int AS paid_out, count(*) FILTER (WHERE status='approved')::int AS approved FROM applications"),
      db.query("SELECT a.id,a.reference_code,a.full_name,a.email,a.phone,a.status,a.payment_status,a.payment_method,a.payment_reference,a.settlement_status,a.settlement_reference,a.payout_status,a.payout_recipient,a.payout_reference,a.payout_at,a.fee_cents,a.created_at,h.title,h.city,h.state FROM applications a JOIN homes h ON h.id=a.home_id ORDER BY a.created_at DESC LIMIT 100"),
      db.query("SELECT id,slug,title,city,state,rent_cents,sale_price_cents,listing_type,is_available,featured,listing_status,status_updated_at,status_note,source_url,source_name,external_listing FROM homes ORDER BY created_at DESC"),
      db.query("SELECT * FROM settings WHERE id=1")
    ]);
    return res.json({ stats: stats.rows[0], applications: apps.rows, homes: homes.rows, settings: settings.rows[0] });
  }

  const b = req.body || {};
  const id = Number(b.id);

  if (b.action === "status") {
    const allowed = ["awaiting_payment", "under_review", "approved", "denied", "withdrawn"];
    const status = clean(b.status, 40);
    if (!integerId(id) || !allowed.includes(status)) return res.status(400).json({ ok: false, error: "Choose a valid application status." });
    const { rows } = await db.query("UPDATE applications SET status=$1,updated_at=now() WHERE id=$2 RETURNING id", [status, id]);
    if (!rows.length) return res.status(404).json({ ok: false, error: "Application not found." });
    return res.json({ ok: true });
  }

  if (b.action === "payment") {
    const method = clean(b.method, 30).toLowerCase();
    const reference = clean(b.reference, 180);
    if (!integerId(id) || !["zelle", "venmo"].includes(method) || reference.length < 4) {
      return res.status(400).json({ ok: false, error: "Select Zelle or Venmo and enter a payment reference of at least 4 characters." });
    }
    const { rows } = await db.query(
      "UPDATE applications SET payment_status='manual_received',payment_method=$1,payment_reference=$2,paid_at=now(),updated_at=now(),admin_notes=concat_ws(E'\\n',NULLIF(admin_notes,''),'Manual receipt recorded by admin on ' || now()::text || '; method=' || $1 || '; reference=' || $2) WHERE id=$3 AND payment_status='unpaid' RETURNING id,reference_code,fee_cents,payment_status,payment_method,payment_reference,paid_at",
      [method, reference, id]
    );
    if (!rows.length) return res.status(409).json({ ok: false, error: "Application not found or already recorded as paid. No existing payment record was overwritten." });
    await db.query("INSERT INTO payment_audit_log (application_id,action,payment_method,payment_reference,amount_cents,recorded_by,details) VALUES ($1,'manual_received',$2,$3,$4,$5,$6)", [id, method, reference, rows[0].fee_cents, clean(req.member?.email || req.member?.id || "project-admin", 180), "Manually reconciled by an authenticated project administrator; not a provider webhook."]);
    return res.json({ ok: true, payment: rows[0], providerVerified: false });
  }

  if (["settlement", "payout"].includes(b.action)) {
    return res.status(409).json({ ok: false, error: "Settlement and payout records can only change through a verified payment-provider event. Manual updates remain disabled." });
  }

  if (b.action === "home") {
    const homeId = Number(b.homeId);
    if (!integerId(homeId) || typeof b.available !== "boolean" || typeof b.featured !== "boolean") {
      return res.status(400).json({ ok: false, error: "Invalid property update." });
    }
    const { rows } = await db.query(
      "UPDATE homes SET is_available=$1,featured=$2,listing_status=CASE WHEN $1 THEN 'available' ELSE CASE WHEN listing_status='available' THEN 'hidden' ELSE listing_status END END,status_updated_at=now() WHERE id=$3 AND (NOT $1 OR listing_status NOT IN ('rented','sold','under_offer')) RETURNING id",
      [b.available, b.featured, homeId]
    );
    if (!rows.length) return res.status(409).json({ ok: false, error: "This home cannot be exposed while its status is rented, sold, or under offer. Update the listing lifecycle status first." });
    return res.json({ ok: true });
  }

  // The legacy authorization action is intentionally no longer supported.

  if (b.action === "listingStatus") {
    const homeId = Number(b.homeId);
    const status = clean(b.status, 30);
    if (!integerId(homeId) || !["available", "rented", "sold", "hidden", "under_offer"].includes(status)) {
      return res.status(400).json({ ok: false, error: "Invalid listing status." });
    }
    // Reopening depends on listing status, not an owner-authorization flag.
    const visible = status === "available";
    const { rows } = await db.query(
      "UPDATE homes SET listing_status=$1,is_available=$2,status_note=$3,status_updated_at=now() WHERE id=$4 RETURNING id",
      [status, visible, clean(b.note, 500) || null, homeId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "Property not found." });
    return res.json({ ok: true });
  }

  if (b.action === "settings") {
    const businessName = clean(b.businessName, 120) || "Wah-Lah KeyCounty";
    const contactEmail = clean(b.contactEmail, 180).toLowerCase();
    const contactPhone = clean(b.contactPhone, 50);
    const fee = Number(b.fee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 10000000) return res.status(400).json({ ok: false, error: "Enter a valid application fee amount." });
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return res.status(400).json({ ok: false, error: "Enter a valid contact email." });
    const venmoHandle = clean(b.venmoHandle, 120).replace(/^@/, "");
    const zelleContact = clean(b.zelleContact, 180);
    await db.query("UPDATE settings SET business_name=$1,contact_email=$2,contact_phone=$3,application_fee_cents=$4,venmo_handle=$5,zelle_contact=$6,updated_at=now() WHERE id=1", [businessName, contactEmail, contactPhone, Math.round(fee), venmoHandle, zelleContact]);
    return res.json({ ok: true });
  }

  return res.status(400).json({ ok: false, error: "Unknown or incomplete admin action." });
}