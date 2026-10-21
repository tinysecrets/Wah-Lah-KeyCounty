import { db } from "hatchable";
export const access = "admin";
export const methods = ["GET", "POST"];

const clean = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const integerId = v => Number.isInteger(Number(v)) && Number(v) > 0;

export default async function (req, res) {
  if (req.method === "GET") {
    const [stats, apps, homes, settings] = await Promise.all([
      db.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE status IN ('under_review','awaiting_payment'))::int AS review, count(*) FILTER (WHERE payment_status IN ('captured','paid'))::int AS paid, count(*) FILTER (WHERE settlement_status='settled')::int AS settled, count(*) FILTER (WHERE payout_status='captured')::int AS paid_out, count(*) FILTER (WHERE status='approved')::int AS approved FROM applications"),
      db.query("SELECT a.id,a.reference_code,a.full_name,a.email,a.phone,a.status,a.payment_status,a.payment_method,a.payment_reference,a.settlement_status,a.settlement_reference,a.payout_status,a.payout_recipient,a.payout_reference,a.payout_at,a.fee_cents,a.created_at,h.title,h.city,h.state FROM applications a JOIN homes h ON h.id=a.home_id ORDER BY a.created_at DESC LIMIT 100"),
      db.query("SELECT id,slug,title,city,state,rent_cents,is_available,featured,listing_status,status_updated_at,status_note,owner_authorized,authorization_note,owner_authorized_at FROM homes ORDER BY created_at DESC"),
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

  if (["payment", "settlement", "payout"].includes(b.action)) {
    return res.status(409).json({ ok: false, error: "Payment, settlement, and payout records can only change through a verified payment-provider event. Manual updates are disabled." });
  }

  if (b.action === "home") {
    const homeId = Number(b.homeId);
    if (!integerId(homeId) || typeof b.available !== "boolean" || typeof b.featured !== "boolean") {
      return res.status(400).json({ ok: false, error: "Invalid property update." });
    }
    const { rows } = await db.query(
      "UPDATE homes SET is_available=$1,featured=$2,listing_status=CASE WHEN $1 THEN 'available' ELSE CASE WHEN listing_status='available' THEN 'hidden' ELSE listing_status END END,status_updated_at=now() WHERE id=$3 AND (NOT $1 OR (owner_authorized=TRUE AND listing_status NOT IN ('rented','sold','under_offer'))) RETURNING id",
      [b.available, b.featured, homeId]
    );
    if (!rows.length) return res.status(409).json({ ok: false, error: "This home cannot be exposed yet. Confirm owner authorization and reopen it through Listing lifecycle if it was rented, sold, or under offer." });
    return res.json({ ok: true });
  }

  if (b.action === "authorization") {
    const homeId = Number(b.homeId);
    if (!integerId(homeId) || typeof b.authorized !== "boolean") return res.status(400).json({ ok: false, error: "Invalid owner authorization update." });
    const authorized = b.authorized;
    const note = clean(b.note, 500);
    if (authorized && note.length < 10) return res.status(400).json({ ok: false, error: "Record at least 10 characters explaining how owner authorization was confirmed." });
    const storedNote = authorized ? note : (note || "Owner authorization revoked; listing hidden.");
    const { rows } = await db.query(
      "UPDATE homes SET owner_authorized=$1,authorization_note=$2,owner_authorized_at=CASE WHEN $1 THEN now() ELSE NULL END,is_available=CASE WHEN $1 THEN is_available ELSE FALSE END,listing_status=CASE WHEN $1 THEN listing_status ELSE CASE WHEN listing_status='available' THEN 'hidden' ELSE listing_status END END,status_updated_at=CASE WHEN $1 THEN status_updated_at ELSE now() END WHERE id=$3 RETURNING id,owner_authorized",
      [authorized, storedNote, homeId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "Property not found." });
    return res.json({ ok: true, authorized: rows[0].owner_authorized });
  }

  if (b.action === "listingStatus") {
    const homeId = Number(b.homeId);
    const status = clean(b.status, 30);
    if (!integerId(homeId) || !["available", "rented", "sold", "hidden", "under_offer"].includes(status)) {
      return res.status(400).json({ ok: false, error: "Invalid listing status." });
    }
    if (status === "available") {
      const { rows: authRows } = await db.query("SELECT owner_authorized FROM homes WHERE id=$1", [homeId]);
      if (!authRows.length) return res.status(404).json({ ok: false, error: "Property not found." });
      if (!authRows[0].owner_authorized) return res.status(409).json({ ok: false, error: "Confirm owner authorization before reopening this listing." });
    }
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
    await db.query("UPDATE settings SET business_name=$1,contact_email=$2,contact_phone=$3,application_fee_cents=$4,updated_at=now() WHERE id=1", [businessName, contactEmail, contactPhone, Math.round(fee)]);
    return res.json({ ok: true });
  }

  return res.status(400).json({ ok: false, error: "Unknown or incomplete admin action." });
}