import { db } from "hatchable";

export const access = "scheduler";
export const methods = ["POST"];

const clean = (v, max = 1200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const STATE_CODES = { ALABAMA:"AL", ALASKA:"AK", ARIZONA:"AZ", ARKANSAS:"AR", CALIFORNIA:"CA", COLORADO:"CO", CONNECTICUT:"CT", DELAWARE:"DE", "DISTRICT OF COLUMBIA":"DC", FLORIDA:"FL", GEORGIA:"GA", HAWAII:"HI", IDAHO:"ID", ILLINOIS:"IL", INDIANA:"IN", IOWA:"IA", KANSAS:"KS", KENTUCKY:"KY", LOUISIANA:"LA", MAINE:"ME", MARYLAND:"MD", MASSACHUSETTS:"MA", MICHIGAN:"MI", MINNESOTA:"MN", MISSISSIPPI:"MS", MISSOURI:"MO", MONTANA:"MT", NEBRASKA:"NE", NEVADA:"NV", "NEW HAMPSHIRE":"NH", "NEW JERSEY":"NJ", "NEW MEXICO":"NM", "NEW YORK":"NY", "NORTH CAROLINA":"NC", "NORTH DAKOTA":"ND", OHIO:"OH", OKLAHOMA:"OK", OREGON:"OR", PENNSYLVANIA:"PA", "RHODE ISLAND":"RI", "SOUTH CAROLINA":"SC", "SOUTH DAKOTA":"SD", TENNESSEE:"TN", TEXAS:"TX", UTAH:"UT", VERMONT:"VT", VIRGINIA:"VA", WASHINGTON:"WA", "WEST VIRGINIA":"WV", WISCONSIN:"WI", WYOMING:"WY" };
const stateCode = (value) => { const s = clean(value, 40).toUpperCase().replace(/\./g, "").replace(/\s+/g, " "); return /^[A-Z]{2}$/.test(s) ? s : (STATE_CODES[s] || ""); };
const httpsUrl = (v) => {
  try { const u = new URL(String(v || "")); return u.protocol === "https:" ? u.href : ""; }
  catch { return ""; }
};
const decode = (s) => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]*>/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();
const tag = (xml, name) => {
  const re = new RegExp("<(?:[\\w.-]+:)?"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?"+name+"\\s*>","i");
  return decode(xml.match(re)?.[1] || "");
};
const attr = (xml, name) => {
  const re = new RegExp("(?:[\\w.-]+:)?"+name+"\\s*=\\s*[\"']([^\"']+)[\"']","i");
  return httpsUrl(xml.match(re)?.[1] || "");
};
function imagesFrom(item) {
  const raw = item.image_urls ?? item.images ?? item.photos ?? item.image ?? item.photo ?? [];
  const vals = Array.isArray(raw) ? raw : (typeof raw === "string" ? raw.split(/[|,\n]/) : []);
  const one = vals.map(v => typeof v === "string" ? v : (v?.url || v?.src || v?.contentUrl || ""))
    .map(httpsUrl).filter(Boolean).filter(value => {
      try {
        const u = new URL(value), host = u.hostname.toLowerCase(), path = u.pathname.toLowerCase();
        // Never treat a property detail page or a Drive share page as a photo.
        if (host === "zillow.com" || host.endsWith(".zillow.com") ||
            host === "drive.google.com" || host.endsWith(".drive.google.com") ||
            host === "realtor.com" || host.endsWith(".realtor.com") ||
            host === "trellistate.com" || host.endsWith(".trellistate.com")) return false;
        return /\.(avif|gif|jpe?g|png|webp)(?:$)/i.test(path) ||
          host === "images.unsplash.com" || host.endsWith(".cloudfront.net");
      } catch { return false; }
    });
  return [...new Set(one)].slice(0, 12);
}
function parseRss(xml) {
  const items = [];
  const re = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = re.exec(xml)) && items.length < 100) {
    const block = match[2];
    let link = tag(block, "link");
    if (!link) link = httpsUrl(block.match(/<link[^>]+href=["']([^"']+)/i)?.[1] || "");
    const urls = [...block.matchAll(/<(?:media:content|media:thumbnail|enclosure)[^>]*(?:url|href)=["']([^"']+)["'][^>]*>/gi)].map(m => httpsUrl(m[1])).filter(Boolean);
    const description = tag(block, "description") || tag(block, "summary") || tag(block, "content");
    const rent = description.match(/\$\s*([\d,]+)(?:\.(\d\d))?\s*(?:\/\s*(?:mo|month)|per month|monthly)?/i);
    const beds = description.match(/(\d+(?:\.\d+)?)\s*(?:bedrooms?|beds?|br)\b/i);
    const baths = description.match(/(\d+(?:\.\d+)?)\s*(?:bathrooms?|baths?|ba)\b/i);
    const sqft = description.match(/([\d,]+)\s*(?:sq\.?\s*ft|square feet|sqft)\b/i);
    items.push({
      title: tag(block, "title"),
      source_url: link,
      description,
      price: rent ? Number(rent[1].replace(/,/g,"")) + Number("0."+(rent[2]||"00")) : null,
      bedrooms: beds ? Number(beds[1]) : null,
      bathrooms: baths ? Number(baths[1]) : null,
      sqft: sqft ? Number(sqft[1].replace(/,/g,"")) : null,
      images: urls
    });
  }
  return items;
}
function normalize(raw, source) {
  const url = httpsUrl(raw.source_url || raw.url || raw.listing_url || raw.link || raw.href);
  const title = clean(raw.title || raw.name || raw.headline || raw.address || raw.address_line_1, 180);
  if (!url || !title) return null;
  const attributionUrl = httpsUrl(raw.source_url || raw.url || raw.listing_url || raw.link || raw.href) || url;
  let attributionHost = "";
  try { attributionHost = new URL(attributionUrl).hostname.toLowerCase().replace(/^www\./,""); } catch {}
  const blockedAttribution = /(^|\.)(zillow\.com|realtor\.com|redfin\.com|trulia\.com|apartments\.com|rent\.com|hotpads\.com|homes\.com)$/.test(attributionHost);
  const displayRights = source.rights_status === "display_allowed" && !blockedAttribution;
  const propertyType = clean(raw.property_type || raw.propertyType || raw.home_type || "", 80).toLowerCase().replace(/[_-]+/g, " ");
  if (/industrial|commercial|warehouse|office|retail|land|business|mixed use/.test(propertyType)) return null;
  const priceValue = raw.price_cents != null ? Number(raw.price_cents) / 100 :
    (raw.rent_cents != null ? Number(raw.rent_cents) / 100 :
    Number(raw.rent_usd ?? raw.rent_min ?? raw.rent ?? raw.price ?? raw.monthly_rent ?? NaN));
  const priceCents = Number.isFinite(priceValue) && priceValue > 0 ? Math.round(priceValue * 100) : null;
  const beds = Number(raw.bedrooms ?? raw.beds ?? raw.bed ?? NaN);
  const baths = Number(raw.bathrooms ?? raw.baths ?? raw.bath ?? NaN);
  const feet = Number(raw.sqft ?? raw.squareFootage ?? raw.square_feet ?? raw.sqft_min ?? NaN);
  const state = stateCode(raw.state || raw.state_code);
  const status = clean(raw.status || raw.availability || "active", 40).toLowerCase();
  if (/inactive|removed|delisted|rented|leased|unavailable|off.market|sold|pending/.test(status)) return null;
  return {
    title,
    listing_type: /sale|purchase|for-sale|buy/.test(String(raw.listing_type || raw.listingType || raw.type || "").toLowerCase()) ? "sale" : "rent",
    property_type: propertyType || "house",
    address: clean(raw.address || raw.formattedAddress || raw.addressLine1 || raw.address_line_1 || raw.street, 240),
    city: clean(raw.city, 100),
    state,
    zip: clean(raw.zip || raw.zipCode || raw.postal_code, 20),
    price_cents: priceCents,
    bedrooms: Number.isFinite(beds) && beds >= 0 ? Math.round(beds) : null,
    bathrooms: Number.isFinite(baths) && baths >= 0 ? baths : null,
    sqft: Number.isFinite(feet) && feet >= 0 ? Math.round(feet) : null,
    source_name: clean(raw.source_name || raw.sourceName || raw.publisher || (raw.source_url ? attributionHost : (raw.platform || source.source_name)), 120),
    source_url: url,
    image_urls: imagesFrom({images: raw.images ?? raw.photos ?? raw.image_urls ?? raw.image ?? raw.photo}),
    source_record_id: clean(raw.id || raw.listing_id || raw.uid || "", 180),
    display_rights: displayRights,
    note: clean(raw.description || raw.summary || raw.features || "", 1000)
  };
}
export default async function (req, res) {
  const run = await db.query("INSERT INTO scout_run_log (run_status) VALUES ('running') RETURNING id");
  const runId = run.rows[0].id;
  const errors = [];
  let checked = 0, seen = 0, added = 0, updated = 0;
  try {
    const sourceResult = await db.query(
      "SELECT * FROM scout_sources WHERE enabled=true AND rights_status='display_allowed' AND (last_checked_at IS NULL OR (last_error IS NOT NULL AND last_checked_at < now() - interval '3 hours') OR (last_error IS NULL AND last_checked_at < now() - interval '6 hours')) ORDER BY CASE WHEN last_error IS NOT NULL THEN 0 ELSE 1 END,last_checked_at NULLS FIRST,id ASC LIMIT 4"
    );
    for (const source of sourceResult.rows) {
      checked++;
      try {
        const response = await fetch(source.feed_url, {
          timeout_ms: 12000,
          headers: { "Accept": source.feed_format === "json" ? "application/json" : "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8" }
        });
        if (!response.ok) throw new Error("Feed returned HTTP " + response.status);
        const body = await response.text();
        let rawItems = [];
        if (source.feed_format === "json") {
          const payload = JSON.parse(body);
          rawItems = Array.isArray(payload) ? payload : (payload.listings || payload.items || payload.properties || payload.results || payload.data || []);
          if (!Array.isArray(rawItems)) rawItems = [];
        } else {
          rawItems = parseRss(body);
        }
        let localSeen = 0;
        for (const raw of rawItems.slice(0, 100)) {
          let sourceItem = raw;
          const detailUrl = httpsUrl(raw.api_url);
          if (detailUrl) {
            try {
              const feedOrigin = new URL(source.feed_url).origin;
              if (new URL(detailUrl).origin === feedOrigin) {
                const detailResponse = await fetch(detailUrl, { timeout_ms: 6000, headers: { "Accept": "application/json" } });
                if (!detailResponse.ok) throw new Error("Detail returned HTTP " + detailResponse.status);
                const detailPayload = await detailResponse.json();
                sourceItem = { ...raw, ...(detailPayload.data || detailPayload) };
                const detailStatus = clean(sourceItem.status || "active", 40).toLowerCase();
                const expiry = sourceItem.expires_at ? Date.parse(sourceItem.expires_at) : NaN;
                if (!["active","available","listed"].includes(detailStatus)) continue;
                if (Number.isFinite(expiry) && expiry <= Date.now()) continue;
              }
            } catch (detailError) {
              errors.push({ source: source.source_name, item: clean(raw.id || raw.title, 180), error: clean(detailError?.message || detailError, 300) });
              continue;
            }
          }
          const item = normalize(sourceItem, source);
          if (!item) continue;
          localSeen++; seen++;
          const prior = await db.query("SELECT id FROM scout_leads WHERE source_url=$1 LIMIT 1", [item.source_url]);
          if (!prior.rows.length && added >= 20) break;
          const result = await db.query(
            "INSERT INTO scout_leads (listing_type,title,property_type,address,city,state,price_cents,bedrooms,bathrooms,sqft,source_name,source_url,image_url,image_urls,source_record_id,source_status,review_status,display_rights,last_checked_at,last_seen_at,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,'feed_active','needs_review',$16,now(),now(),$17) ON CONFLICT (source_url) DO UPDATE SET listing_type=EXCLUDED.listing_type,title=EXCLUDED.title,property_type=EXCLUDED.property_type,address=EXCLUDED.address,city=EXCLUDED.city,state=EXCLUDED.state,price_cents=EXCLUDED.price_cents,bedrooms=EXCLUDED.bedrooms,bathrooms=EXCLUDED.bathrooms,sqft=EXCLUDED.sqft,source_name=EXCLUDED.source_name,image_url=EXCLUDED.image_url,image_urls=EXCLUDED.image_urls,source_record_id=EXCLUDED.source_record_id,source_status='feed_active',display_rights=EXCLUDED.display_rights,last_checked_at=now(),last_seen_at=now(),review_status=CASE WHEN scout_leads.review_status='published' THEN 'published' WHEN scout_leads.review_status='rejected' THEN 'rejected' ELSE 'needs_review' END,updated_at=now(),notes=EXCLUDED.notes RETURNING id",
            [item.listing_type,item.title,item.property_type,item.address,item.city||"Unknown",item.state||"NA",item.price_cents,item.bedrooms,item.bathrooms,item.sqft,item.source_name,item.source_url,item.image_urls[0]||null,JSON.stringify(item.image_urls),item.source_record_id,item.display_rights,item.note]
          );
          if (prior.rows.length) updated++; else added++;
          // A successful source refresh also resets the 24-hour public-listing freshness clock.
          await db.query(
            "UPDATE homes SET listing_type=$1,title=$2,address=$3,city=$4,state=$5,zip=$6,rent_cents=$7,sale_price_cents=$8,deposit_cents=$9,bedrooms=$10,bathrooms=$11,sqft=$12,property_type=$13,description=$14,image_url=$15,image_urls=$16::jsonb,source_name=$17,status_updated_at=now() WHERE source_url=$18 AND external_listing=true AND is_available=true AND listing_status='available'",
            [item.listing_type,item.title,item.address,item.city||"Unknown",item.state||"NA",item.zip||"",item.listing_type==="rent"?item.price_cents||0:0,item.listing_type==="sale"?item.price_cents:null,item.listing_type==="rent"?item.price_cents||0:0,item.bedrooms??0,item.bathrooms??0,item.sqft??0,item.property_type||"House",item.note||"Source-linked property; verify current terms at source.",item.image_urls[0]||"",JSON.stringify(item.image_urls),item.source_name,item.source_url]
          );
          // AUTOPUBLISH: no owner/admin click is required for a current, complete,
          // explicitly display-licensed residential listing from an enabled feed.
          const candidate = (await db.query("SELECT * FROM scout_leads WHERE source_url=$1 LIMIT 1",[item.source_url])).rows[0];
          const normalizedState = stateCode(candidate?.state);
          const validFacts = candidate && candidate.display_rights===true &&
            candidate.source_status==="feed_active" && candidate.address && candidate.city &&
            candidate.city!=="Unknown" && normalizedState && Number(candidate.price_cents)>0 &&
            candidate.bedrooms!==null && Number(candidate.bedrooms)>=0 &&
            candidate.bathrooms!==null && Number(candidate.bathrooms)>0 &&
            (candidate.listing_type!=="rent" || Number(candidate.sqft)>0) &&
            ["rent","sale"].includes(candidate.listing_type);
          if (validFacts) {
            const slugBase = clean(candidate.title,120).toLowerCase()
              .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,90) || "home";
            const existingHome = await db.query(
              "SELECT id FROM homes WHERE source_url=$1 AND external_listing=true LIMIT 1",[candidate.source_url]
            );
            if (existingHome.rows.length) {
              await db.query(
                "UPDATE homes SET listing_type=$1,title=$2,address=$3,city=$4,state=$5,zip=$6,rent_cents=$7,sale_price_cents=$8,deposit_cents=$9,bedrooms=$10,bathrooms=$11,sqft=$12,property_type=$13,description=$14,image_url=$15,image_urls=$16::jsonb,is_available=true,listing_status='available',status_updated_at=now(),status_note='Automatically published using current display-licensed feed data.',source_name=$17 WHERE id=$18",
                [candidate.listing_type,candidate.title,candidate.address,candidate.city,candidate.state,clean(candidate.zip,20),candidate.listing_type==="rent"?candidate.price_cents:0,candidate.listing_type==="sale"?candidate.price_cents:null,candidate.listing_type==="rent"?candidate.price_cents:0,candidate.bedrooms,candidate.bathrooms,candidate.sqft||0,candidate.property_type||"House",clean(candidate.notes,1500)||"Source-linked listing. Confirm current terms with the listing source.",candidate.image_url||"",JSON.stringify(Array.isArray(candidate.image_urls)?candidate.image_urls:[]),candidate.source_name,existingHome.rows[0].id]
              );
            } else {
              await db.query(
                "INSERT INTO homes (slug,title,address,city,state,zip,rent_cents,deposit_cents,sale_price_cents,bedrooms,bathrooms,sqft,listing_type,property_type,description,image_url,image_urls,features,pets_allowed,available_from,is_available,featured,listing_status,status_updated_at,status_note,source_url,source_name,external_listing,owner_authorized) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,'[]'::jsonb,false,'Verify current terms at source',true,false,'available',now(),'Automatically published using current display-licensed feed data.',$18,$19,true,false)",
                [slugBase+"-"+candidate.id,candidate.title,candidate.address,candidate.city,candidate.state,clean(candidate.zip,20),candidate.listing_type==="rent"?candidate.price_cents:0,candidate.listing_type==="rent"?candidate.price_cents:0,candidate.listing_type==="sale"?candidate.price_cents:null,candidate.bedrooms,candidate.bathrooms,candidate.sqft||0,candidate.listing_type,candidate.property_type||"House",clean(candidate.notes,1500)||"Source-linked listing. Confirm current terms with the listing source.",candidate.image_url||"",JSON.stringify(Array.isArray(candidate.image_urls)?candidate.image_urls:[]),candidate.source_url,candidate.source_name]
              );
            }
            await db.query("UPDATE scout_leads SET review_status='published',updated_at=now() WHERE id=$1",[candidate.id]);
          }
        }
        await db.query("UPDATE scout_sources SET last_checked_at=now(),last_error=NULL,updated_at=now() WHERE id=$1", [source.id]);
        // Keep source-level extraction stats in the run log, not as public listing claims.
      } catch (e) {
        const msg = clean(e?.message || e, 500);
        errors.push({source:source.source_name, error:msg});
        await db.query("UPDATE scout_sources SET last_checked_at=now(),last_error=$1,updated_at=now() WHERE id=$2", [msg,source.id]);
      }
    }
    const enabledFeeds = await db.query("SELECT count(*)::int AS total FROM scout_sources WHERE enabled=true AND rights_status='display_allowed'");
    const status = checked === 0 ? (enabledFeeds.rows[0]?.total > 0 ? "no_sources_due" : "waiting_for_display_licensed_feed") : (errors.length ? (checked===errors.length?"source_errors":"partial_success") : "success");
    await db.query("UPDATE scout_run_log SET finished_at=now(),run_status=$1,sources_checked=$2,candidates_seen=$3,candidates_added=$4,candidates_updated=$5,errors=$6::jsonb WHERE id=$7",
      [status,checked,seen,added,updated,JSON.stringify(errors),runId]);
    return res.json({ok:true,runId,status,limits:{maxSourcesPerRun:4,maxCandidatesProcessedPerFeed:100,maxNewCandidatesPerRun:20,sourceCooldownHours:6},sourcesChecked:checked,candidatesSeen:seen,candidatesAdded:Math.min(added,20),candidatesUpdated:updated,errors,sourceNote:checked===0?"Authorized feeds exist, but none is due for its six-hour refresh window. No unlicensed pages or photos were copied.":undefined});
  } catch (e) {
    const msg = clean(e?.message || e, 500);
    await db.query("UPDATE scout_run_log SET finished_at=now(),run_status='error',errors=$1::jsonb WHERE id=$2",[JSON.stringify([{error:msg}]),runId]);
    return res.status(500).json({ok:false,runId,error:msg});
  }
}