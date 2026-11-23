import { db, scheduler } from "hatchable";
import { queueEmail, escapeEmailHtml } from "lib/notifications.js";

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

  const recent = await db.query(
    "SELECT count(*)::int AS total FROM connection_requests WHERE lower(email)=$1 AND created_at > now()-interval '1 hour'",
    [email]
  );
  if (Number(recent.rows[0]?.total || 0) >= 3) {
    return res.status(429).json({ ok: false, message: "We already received several requests for this email. Please try again later." });
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

  const homeLabel = clean(home.title, 180) + " · " + clean(home.city, 80) + ", " + clean(home.state, 40);
  const feeLabel = "$" + (feeCents / 100).toFixed(2);
  const paymentNote = feeCents > 0
    ? "The one-time KeyCounty service fee is " + feeLabel + " and has not been paid yet. Continue to secure checkout on the property page. Do not submit a second request."
    : "No service fee is due for this request.";
  const customerText = "Your Wah-Lah KeyCounty home-connection request has been saved.\nReference: " + referenceCode + "\nProperty: " + homeLabel + "\n\n" + paymentNote + "\n\nThis is a request for KeyCounty assistance, not a landlord application, purchase offer, rent, or deposit. We will follow up using the contact details you provided.";
  const customerHtml = "<p>Your Wah-Lah KeyCounty home-connection request has been saved.</p><p><strong>Reference:</strong> " + referenceCode + "<br><strong>Property:</strong> " + escapeEmailHtml(homeLabel) + "</p><p>" + escapeEmailHtml(paymentNote) + "</p><p>This is a request for KeyCounty assistance, not a landlord application, purchase offer, rent, or deposit. We will follow up using the contact details you provided.</p>";
  const adminText = "New KeyCounty property connection request.\nReference: " + referenceCode + "\nProperty: " + homeLabel + "\nName: " + fullName + "\nEmail: " + email + "\nPhone: " + (phone || "Not supplied") + "\nPayment: " + (feeCents > 0 ? "unpaid — checkout required" : "no fee due") + "\nReview the Connections dashboard. Do not fulfill an unpaid request.";
  const adminHtml = "<p>New KeyCounty property connection request.</p><p><strong>Reference:</strong> " + referenceCode + "<br><strong>Property:</strong> " + escapeEmailHtml(homeLabel) + "<br><strong>Name:</strong> " + escapeEmailHtml(fullName) + "<br><strong>Email:</strong> " + escapeEmailHtml(email) + "<br><strong>Phone:</strong> " + escapeEmailHtml(phone || "Not supplied") + "<br><strong>Payment:</strong> " + (feeCents > 0 ? "Unpaid — checkout required" : "No fee due") + "</p><p>Review the Connections dashboard. Do not fulfill an unpaid request.</p>";
  await queueEmail({eventKey:"connection:" + referenceCode + ":customer",to:email,subject:"Your KeyCounty request is saved · " + referenceCode,text:customerText,html:customerHtml});
  await queueEmail({eventKey:"connection:" + referenceCode + ":admin",to:"admin@wah-lah.com",subject:"New KeyCounty connection request · " + referenceCode,text:adminText,html:adminHtml});
  try { await scheduler.now("/api/jobs/notification-outbox"); } catch (_) {}

  if (feeCents === 0) {
    return res.status(201).json({
      ok: true,
      referenceCode,
      feeCents,
      paymentRequired: false,
      notificationQueued: true,
      message: "Your connection request is saved. A confirmation email is on its way."
    });
  }

  return res.status(201).json({
    ok: true,
    referenceCode,
    feeCents: rows[0].fee_cents,
    email,
    paymentRequired: true,
    notificationQueued: true,
    message: "Your home-connection request is saved. A confirmation email is on its way. Continue to secure Stripe checkout to submit it for follow-up."
  });
}