import { db } from "hatchable";

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
  return res.status(201).json({
    ok: true,
    leadId: result.rows[0].id,
    message: "Your housing request is saved. Wah-Lah KeyCounty can follow up using the contact details you provided."
  });
}