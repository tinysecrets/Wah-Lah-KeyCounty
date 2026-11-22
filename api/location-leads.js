import { db, scheduler } from "hatchable";
import { queueEmail, escapeEmailHtml } from "lib/notifications.js";

export const access = "public";
export const methods = ["POST"];

const clean = (v, max = 500) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export default async function (req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed." });
  const b = req.body || {};
  const fullName = clean(b.fullName, 120);
  const email = clean(b.email, 180).toLowerCase();
  const phone = clean(b.phone, 50);
  const requestedArea = clean(b.requestedArea, 160);
  const listingType = clean(b.listingType, 10) || "all";
  const message = clean(b.message, 1200);
  const maxPrice = b.maxPrice === "" || b.maxPrice == null ? null : Number(b.maxPrice);
  const minBedrooms = b.minBedrooms === "" || b.minBedrooms == null ? null : Number(b.minBedrooms);
  const consent = b.contactConsent === true || b.contactConsent === "on";

  if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || requestedArea.length < 2 ||
      !["all", "rent", "sale"].includes(listingType) || !consent) {
    return res.status(400).json({ ok: false, error: "Enter your name, valid email, preferred area, and consent to be contacted." });
  }
  if (maxPrice !== null && (!Number.isSafeInteger(maxPrice) || maxPrice < 0 || maxPrice > 100000000)) {
    return res.status(400).json({ ok: false, error: "Enter a valid maximum price." });
  }
  if (minBedrooms !== null && (!Number.isSafeInteger(minBedrooms) || minBedrooms < 0 || minBedrooms > 20)) {
    return res.status(400).json({ ok: false, error: "Enter a valid bedroom count." });
  }

  const recent = await db.query(
    "SELECT count(*)::int AS total FROM area_search_leads WHERE lower(email)=$1 AND created_at > now() - interval '1 hour'",
    [email]
  );
  if (Number(recent.rows[0]?.total || 0) >= 3) {
    return res.status(429).json({ ok: false, error: "We already received several requests for this email. Please try again later." });
  }

  const result = await db.query(
    "INSERT INTO area_search_leads (full_name,email,phone,requested_area,listing_type,max_price_cents,min_bedrooms,message,consent_to_contact) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,created_at",
    [fullName,email,phone,requestedArea,listingType,maxPrice === null ? null : Math.round(maxPrice * 100),minBedrooms,message,consent]
  );
  const leadId = result.rows[0].id;
  const reference = "KC-AREA-" + leadId;
  const customerText = "We received your Wah-Lah KeyCounty housing request.\nReference: " + reference + "\nArea: " + requestedArea + "\nRequest type: " + listingType + "\n\nYour request is saved for follow-up. This is not a promise that a matching property is available. You can reply to this email or contact admin@wah-lah.com for help.";
  const customerHtml = "<p>We received your Wah-Lah KeyCounty housing request.</p><p><strong>Reference:</strong> " + reference + "<br><strong>Area:</strong> " + escapeEmailHtml(requestedArea) + "<br><strong>Request type:</strong> " + escapeEmailHtml(listingType) + "</p><p>Your request is saved for follow-up. This is not a promise that a matching property is available.</p><p>Reply to this email or contact <a href=\"mailto:admin@wah-lah.com\">admin@wah-lah.com</a> for help.</p>";
  const adminText = "New consented KeyCounty area request.\nReference: " + reference + "\nName: " + fullName + "\nEmail: " + email + "\nPhone: " + (phone || "Not supplied") + "\nArea: " + requestedArea + "\nType: " + listingType + "\nReview and follow up in the KeyCounty Area Requests dashboard.";
  const adminHtml = "<p>New consented KeyCounty area request.</p><p><strong>Reference:</strong> " + reference + "<br><strong>Name:</strong> " + escapeEmailHtml(fullName) + "<br><strong>Email:</strong> " + escapeEmailHtml(email) + "<br><strong>Phone:</strong> " + escapeEmailHtml(phone || "Not supplied") + "<br><strong>Area:</strong> " + escapeEmailHtml(requestedArea) + "<br><strong>Type:</strong> " + escapeEmailHtml(listingType) + "</p><p>Review and follow up in the KeyCounty Area Requests dashboard.</p>";
  await queueEmail({eventKey:"area-lead:" + leadId + ":customer",to:email,subject:"We received your KeyCounty housing request",text:customerText,html:customerHtml});
  await queueEmail({eventKey:"area-lead:" + leadId + ":admin",to:"admin@wah-lah.com",subject:"New KeyCounty housing request · " + reference,text:adminText,html:adminHtml});
  try { await scheduler.now("/api/jobs/notification-outbox"); } catch (_) {}
  return res.status(201).json({
    ok: true,
    leadId,
    notificationQueued: true,
    message: "Your housing request is saved. A confirmation email is on its way, and Wah-Lah KeyCounty can follow up using the contact details you provided."
  });
}