import { db, scheduler } from "hatchable";
import { queueEmail, escapeEmailHtml } from "lib/notifications.js";

export const access = "public";
export const methods = ["POST"];

const clean = (v, n = 1200) => String(v ?? "").trim().slice(0, n);
const checked = v => v === "on" || v === true;
const httpsUrl = value => {
  try { const u = new URL(String(value || "")); return u.protocol === "https:" ? u.href : ""; }
  catch { return ""; }
};
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export default async function (req, res) {
  const b = req.body || {};
  const name = clean(b.ownerName, 120);
  const emailAddress = clean(b.ownerEmail, 180).toLowerCase();
  const title = clean(b.title, 180);
  const city = clean(b.city, 100) || "Montgomery";
  const state = clean(b.state, 20) || "AL";
  const listingType = clean(b.listingType, 10).toLowerCase();
  const listedPrice = Number(b.listingPrice);
  const beds = Number(b.bedrooms);
  const baths = Number(b.bathrooms);
  const sqft = Number(b.sqft);
  const sourceUrlRaw = clean(b.sourceUrl, 1000);
  const sourceUrl = httpsUrl(sourceUrlRaw);
  const sourceName = clean(b.sourceName, 120);
  const attested = checked(b.authorizationAttestation);
  const rawPhotoUrls = clean(b.photoUrls, 5000).split(String.fromCharCode(10)).map(u => u.trim()).filter(Boolean);
  if (rawPhotoUrls.length > 8) {
    return res.status(400).json({ ok: false, message: "Please provide no more than 8 property photos." });
  }
  if (sourceUrlRaw && !sourceUrl) {
    return res.status(400).json({ ok: false, message: "The original listing link must be a valid HTTPS URL." });
  }
  if (rawPhotoUrls.some(u => !httpsUrl(u))) {
    return res.status(400).json({ ok: false, message: "Each property photo must be a direct HTTPS URL, one per line." });
  }
  const photoUrls = [...new Set(rawPhotoUrls.map(httpsUrl))];

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress) || !title ||
      !["rent", "sale"].includes(listingType) || !Number.isFinite(listedPrice) || listedPrice <= 0 ||
      !attested || (!sourceUrl && photoUrls.length === 0)) {
    return res.status(400).json({
      ok: false,
      message: "Enter your contact details, choose For Sale or For Rent / Lease, add the price and at least one listing link or real photo, and confirm you are authorized to submit the property."
    });
  }

  const recent = await db.query(
    "SELECT count(*)::int AS total FROM listing_submissions WHERE lower(owner_email)=$1 AND created_at > now()-interval '24 hours'",
    [emailAddress]
  );
  if (Number(recent.rows[0]?.total || 0) >= 3) {
    return res.status(429).json({ ok: false, message: "We already received several property submissions for this email today. Please try again tomorrow." });
  }

  const cents = Math.round(listedPrice * 100);
  const monthlyRentCents = listingType === "rent" ? cents : null;
  const salePriceCents = listingType === "sale" ? cents : null;
  const { rows } = await db.query(
    "INSERT INTO listing_submissions (owner_name,owner_email,owner_phone,property_title,address,city,state,zip,monthly_rent_cents,sale_price_cents,listing_type,submitter_attests_authorized,bedrooms,bathrooms,sqft,description,photo_data,source_url,source_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19) RETURNING id",
    [
      name, emailAddress, clean(b.ownerPhone, 50), title, clean(b.address, 250), city, state, clean(b.zip, 12),
      monthlyRentCents, salePriceCents, listingType, true,
      Number.isFinite(beds) && b.bedrooms !== "" && b.bedrooms != null ? Math.max(0, Math.round(beds)) : null,
      Number.isFinite(baths) && b.bathrooms !== "" && b.bathrooms != null ? Math.max(0, baths) : null,
      Number.isFinite(sqft) && b.sqft !== "" && b.sqft != null ? Math.max(0, Math.round(sqft)) : null,
      clean(b.description, 2000), JSON.stringify(photoUrls), sourceUrl, sourceName
    ]
  );

  const submissionId = rows[0]?.id;
  const kind = listingType === "sale" ? "for-sale" : "for-rent/lease";
  const customerText = "We received your Wah-Lah KeyCounty property submission.\nSubmission: KC-LISTING-" + submissionId + "\nProperty: " + title + "\nArea: " + city + ", " + state + "\n\nYour property is pending review. It is not published yet. We will review authorization, listing details, and photo rights before deciding whether it can appear in the marketplace. There is no charge for submitting this review request.";
  const customerHtml = "<p>We received your Wah-Lah KeyCounty property submission.</p><p><strong>Submission:</strong> KC-LISTING-" + submissionId + "<br><strong>Property:</strong> " + escapeEmailHtml(title) + "<br><strong>Area:</strong> " + escapeEmailHtml(city) + ", " + escapeEmailHtml(state) + "</p><p>Your property is pending review. It is not published yet. We will review authorization, listing details, and photo rights before deciding whether it can appear in the marketplace. There is no charge for submitting this review request.</p>";
  const adminText = "A new " + kind + " property submission needs review.\nSubmission: KC-LISTING-" + submissionId + "\nProperty: " + title + "\nArea: " + city + ", " + state + "\nSubmitter: " + name + " <" + emailAddress + ">\nReview it in the KeyCounty Control Center.";
  const adminHtml = "<p>A new " + kind + " property submission needs review.</p><p><strong>Submission:</strong> KC-LISTING-" + submissionId + "<br><strong>Property:</strong> " + escapeEmailHtml(title) + "<br><strong>Area:</strong> " + escapeEmailHtml(city) + ", " + escapeEmailHtml(state) + "<br><strong>Submitter:</strong> " + escapeEmailHtml(name) + " &lt;" + escapeEmailHtml(emailAddress) + "&gt;</p><p>Review it in the KeyCounty Control Center.</p>";
  await queueEmail({eventKey:"listing-submission:" + submissionId + ":customer",to:emailAddress,subject:"KeyCounty received your property submission",text:customerText,html:customerHtml});
  await queueEmail({eventKey:"listing-submission:" + submissionId + ":admin",to:"admin@wah-lah.com",subject:"New KeyCounty property submission · " + submissionId,text:adminText,html:adminHtml});
  try { await scheduler.now("/api/jobs/notification-outbox"); } catch (_) {}

  return res.status(201).json({
    ok: true,
    id: submissionId,
    status: "pending_review",
    notificationQueued: true,
    message: "Property received for review. A confirmation email is on its way. Sale and rent/lease submissions use the same KeyCounty marketplace. We review authorization, details, and photos before publication."
  });
}