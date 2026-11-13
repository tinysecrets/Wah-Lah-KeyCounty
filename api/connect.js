import { db } from "hatchable";

export const access = "public";
export const methods = ["POST"];

const clean = (v, max = 1000) => String(v ?? "").trim().slice(0, max);
// Paddle checkout is created server-side by /api/paddle-checkout.

export default async function (req, res) {
  const b = req.body || {};
  const homeId = Number(b.homeId);
  const fullName = clean(b.fullName, 120);
  const email = clean(b.email, 180).toLowerCase();
  const phone = clean(b.phone, 50);
  const preferredContact = clean(b.preferredContact, 10) || "email";
  const message = clean(b.message, 1200);
  const contactConsent = b.contactConsent === true || b.contactConsent === "on";

  if (!Number.isSafeInteger(homeId) || homeId <= 0 ||
      !fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !["email", "phone"].includes(preferredContact) || (preferredContact === "phone" && !phone) || !contactConsent) {
    return res.status(400).json({ ok: false, message: "Enter your name and valid email, agree to property-specific contact, and provide a phone number if you choose phone contact." });
  }

  const { rows: homes } = await db.query(
    "SELECT id,title,city,state,listing_type,source_url,source_name,is_available,listing_status,owner_authorized,external_listing FROM homes WHERE id=$1",
    [homeId]
  );
  const home = homes[0];
  if (!home || !home.is_available || home.listing_status !== "available" ||
      !(home.owner_authorized || (home.external_listing && home.source_url))) {
    return res.status(409).json({ ok: false, message: "This property is not currently available for a connection request." });
  }

  const { rows: settings } = await db.query("SELECT application_fee_cents FROM settings WHERE id=1");
  const feeCents = Number(settings[0]?.application_fee_cents ?? 3500);
  if (!Number.isSafeInteger(feeCents) || feeCents < 0) {
    return res.status(503).json({ ok: false, message: "The connection fee is temporarily unavailable. Please contact admin@wah-lah.com." });
  }

  const referenceCode = "KC-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 9).toUpperCase();
  const { rows } = await db.query(
    "INSERT INTO connection_requests (reference_code,home_id,full_name,email,phone,preferred_contact,message,consent_to_contact,fee_cents,status,payment_status) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10) RETURNING reference_code,fee_cents",
    [referenceCode, home.id, fullName, email, phone, preferredContact, message, feeCents, feeCents > 0 ? "awaiting_payment" : "paid", feeCents > 0 ? "unpaid" : "paid"]
  );

  if (feeCents === 0) {
    return res.status(201).json({
      ok: true,
      referenceCode: rows[0].reference_code,
      feeCents,
      paymentRequired: false,
      message: "Your connection request is saved."
    });
  }

  return res.status(201).json({
    ok: true,
    referenceCode: rows[0].reference_code,
    feeCents: rows[0].fee_cents,
    email,
    paymentRequired: true,
    message: "Your home-connection request is saved. Continue to secure Stripe checkout to submit it for follow-up."
  });
}