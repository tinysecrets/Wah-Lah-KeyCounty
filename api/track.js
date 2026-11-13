import { db } from "hatchable";

export const access = "public";
export const methods = ["POST"];

const EVENTS = new Set([
  "page_view",
  "listing_grid_shown",
  "connection_start",
  "connection_request_saved",
  "checkout_opened",
  "area_request_submitted",
  "owner_listing_submitted",
  "external_listing_clicked",
  "filters_used"
]);
const clean = (v, max = 180) => String(v ?? "").trim().replace(/[\r\n\u0000-\u001f]/g, "").slice(0, max);

export default async function (req, res) {
  const b = req.body || {};
  const eventName = clean(b.eventName, 60);
  const eventId = clean(b.eventId, 100);
  const pagePath = clean(b.pagePath || "/", 240);
  if (!EVENTS.has(eventName)) return res.status(400).json({ ok: false, error: "Unsupported event." });
  if (!eventId || !/^[A-Za-z0-9._:-]{8,100}$/.test(eventId)) return res.status(400).json({ ok: false, error: "A unique event ID is required." });
  if (!pagePath.startsWith("/") || pagePath.startsWith("//")) return res.status(400).json({ ok: false, error: "Invalid page path." });

  const source = clean(b.utmSource, 100) || null;
  const medium = clean(b.utmMedium, 100) || null;
  const campaign = clean(b.utmCampaign, 120) || null;
  const content = clean(b.utmContent, 120) || null;
  const numericListing = Number(b.listingId);
  const listingId = Number.isSafeInteger(numericListing) && numericListing > 0 ? numericListing : null;
  const metadata = {};
  if (eventName === "listing_grid_shown") {
    const count = Number(b.metadata?.listingCount);
    if (Number.isFinite(count)) metadata.listingCount = Math.max(0, Math.min(100, Math.round(count)));
  }
  const visitorSession = clean(b.metadata?.visitorSession, 80);
  if (/^[A-Za-z0-9._:-]{12,80}$/.test(visitorSession)) metadata.visitorSession = visitorSession;
  const referrerHost = clean(b.metadata?.referrerHost, 160).toLowerCase();
  if (/^[a-z0-9.-]{1,160}$/.test(referrerHost)) metadata.referrerHost = referrerHost;
  const { rows } = await db.query(
    "INSERT INTO growth_events (event_id,event_name,page_path,utm_source,utm_medium,utm_campaign,utm_content,listing_id,event_metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT (event_id) DO NOTHING RETURNING id",
    [eventId,eventName,pagePath,source,medium,campaign,content,listingId,JSON.stringify(metadata)]
  );
  return res.status(201).json({ ok: true, recorded: rows.length === 1 });
}