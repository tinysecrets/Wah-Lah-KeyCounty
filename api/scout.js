import { db } from "hatchable";
import { evaluateRiverRegion } from "lib/river-region-guardrails.js";

export const access = "admin";
export const methods = ["GET", "POST"];

const clean = (v, n = 500) => String(v ?? "").trim().slice(0, n);
const https = (value) => {
  try { const u = new URL(String(value || "")); return u.protocol === "https:" ? u.href : ""; }
  catch { return ""; }
};
const slugify = (v) => clean(v, 180).toLowerCase().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 110) || "home";

export default async function (req, res) {
  if (req.method === "GET") {
    const [leads, summary, sources, lastRun] = await Promise.all([
      db.query("SELECT id,listing_type,title,property_type,address,city,state,price_cents,bedrooms,bathrooms,sqft,source_name,source_url,source_status,review_status,last_checked_at,last_seen_at,notes,display_rights,county,county_fips,county_verified,owner_authorized,owner_authorization_reference,owner_authorized_at,image_urls,created_at,updated_at FROM scout_leads ORDER BY CASE review_status WHEN 'needs_review' THEN 0 WHEN 'verified' THEN 1 ELSE 2 END, updated_at DESC LIMIT 300"),
      db.query("SELECT count(*)::int total,count(*) FILTER (WHERE review_status='needs_review')::int needs_review,count(*) FILTER (WHERE review_status='verified')::int verified,count(*) FILTER (WHERE listing_type='rent')::int rentals,count(*) FILTER (WHERE listing_type='sale')::int sales,count(*) FILTER (WHERE display_rights=true)::int display_licensed FROM scout_leads"),
      db.query("SELECT id,source_name,feed_url,feed_format,enabled,rights_status,last_checked_at,last_error,notes FROM scout_sources ORDER BY enabled DESC,source_name ASC"),
      db.query("SELECT id,started_at,finished_at,run_status,sources_checked,candidates_seen,candidates_added,candidates_updated,errors FROM scout_run_log ORDER BY started_at DESC LIMIT 1")
    ]);
    const enabledSources = sources.rows.filter(s => s.enabled && s.rights_status === "display_allowed").length;
    const run = lastRun.rows[0] || null;
    return res.json({
      leads: leads.rows, summary: summary.rows[0], sources: sources.rows, lastRun: run,
      automation: {
        scheduler: "hourly",
        enabled: true,
        collecting: enabledSources > 0,
        sourcesConfigured: enabledSources,
        batchLimit: 20,
        photoLimitPerListing: 12,
        mode: "licensed JSON/RSS/Atom feeds only",
        state: enabledSources ? "active" : "waiting_for_display_licensed_feed",
        reason: enabledSources ? "Hourly discovery is enabled. Complete, current listings from display-licensed feeds may be published automatically; incomplete, expired, or unlicensed candidates remain private." : "The hourly job is scheduled, but no source feed with public-display rights is connected. It will not scrape portal pages or republish unlicensed photos."
      }
    });
  }

  const b = req.body || {};
  if (b.action === "add") {
    const type = clean(b.listingType, 10), title = clean(b.title, 180);
    const url = https(b.sourceUrl), source = clean(b.sourceName, 120);
    if (!["rent", "sale"].includes(type) || !title || !url || !source)
      return res.status(400).json({ ok: false, error: "Provide listing type, title, source name, and an HTTPS source URL." });
    const price = Number(b.priceCents), beds = Number(b.bedrooms), baths = Number(b.bathrooms), sqft = Number(b.sqft);
    const imageUrls = (Array.isArray(b.imageUrls) ? b.imageUrls : []).map(https).filter(Boolean).slice(0,12);
    const { rows } = await db.query(
      "INSERT INTO scout_leads (listing_type,title,address,city,state,price_cents,bedrooms,bathrooms,sqft,source_name,source_url,image_url,image_urls,source_status,review_status,display_rights,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,'unverified','needs_review',false,$14) ON CONFLICT (source_url) DO UPDATE SET title=EXCLUDED.title,address=EXCLUDED.address,city=EXCLUDED.city,state=EXCLUDED.state,price_cents=EXCLUDED.price_cents,bedrooms=EXCLUDED.bedrooms,bathrooms=EXCLUDED.bathrooms,sqft=EXCLUDED.sqft,source_name=EXCLUDED.source_name,image_url=EXCLUDED.image_url,image_urls=EXCLUDED.image_urls,source_status='unverified',review_status=CASE WHEN scout_leads.review_status='published' THEN 'published' ELSE 'needs_review' END,updated_at=now(),notes=EXCLUDED.notes RETURNING id",
      [type,title,clean(b.address,250),clean(b.city,100)||"Unknown",clean(b.state,20)||"NA",Number.isFinite(price)&&price>=0?Math.round(price):null,Number.isFinite(beds)&&b.bedrooms!==""&&b.bedrooms!=null?Math.max(0,Math.round(beds)):null,Number.isFinite(baths)&&b.bathrooms!==""&&b.bathrooms!=null?Math.max(0,baths):null,Number.isFinite(sqft)&&b.sqft!==""&&b.sqft!=null?Math.max(0,Math.round(sqft)):null,source,url,imageUrls[0]||null,JSON.stringify(imageUrls),clean(b.notes,1000)]
    );
    return res.status(201).json({ ok:true, id:rows[0]?.id, displayRights:false, message:"Saved privately. Manual entries are not automatically granted public display rights." });
  }

  if (b.action === "source") {
    const sourceName = clean(b.sourceName,120), feedUrl = https(b.feedUrl), format = clean(b.feedFormat,10).toLowerCase();
    if (!sourceName || !feedUrl || !["json","rss","atom"].includes(format))
      return res.status(400).json({ok:false,error:"Provide a source name, HTTPS feed URL, and JSON, RSS, or Atom format."});
    if (b.displayRightsConfirmed !== true)
      return res.status(400).json({ok:false,error:"Public display rights must be confirmed before activating this feed."});
    const notes = clean(b.notes,1000);
    const {rows} = await db.query(
      "INSERT INTO scout_sources (source_name,feed_url,feed_format,enabled,rights_status,notes) VALUES ($1,$2,$3,true,'display_allowed',$4) ON CONFLICT (feed_url) DO UPDATE SET source_name=EXCLUDED.source_name,feed_format=EXCLUDED.feed_format,enabled=true,rights_status='display_allowed',notes=EXCLUDED.notes,last_error=NULL,updated_at=now() RETURNING id,source_name,feed_url,feed_format,enabled,rights_status",
      [sourceName,feedUrl,format,notes]
    );
    return res.status(201).json({ok:true,source:rows[0],message:"Feed enabled. The hourly scout will collect up to 20 new candidates per run."});
  }

  if (b.action === "sourceToggle") {
    const id=Number(b.id);
    if(!Number.isInteger(id)||id<=0||typeof b.enabled!=="boolean")
      return res.status(400).json({ok:false,error:"Invalid source update."});
    const {rows}=await db.query("UPDATE scout_sources SET enabled=$1,updated_at=now() WHERE id=$2 RETURNING id,enabled,rights_status",[b.enabled,id]);
    if(!rows.length)return res.status(404).json({ok:false,error:"Source feed not found."});
    return res.json({ok:true,source:rows[0]});
  }

  if (b.action === "authorizeOwner") {
    const leadId=Number(b.id), reference=clean(b.authorizationReference,1000);
    if(!Number.isInteger(leadId)||leadId<=0||reference.length<8)
      return res.status(400).json({ok:false,error:"Provide a valid candidate ID and a verifiable owner authorization reference."});
    const {rows}=await db.query("SELECT * FROM scout_leads WHERE id=$1 LIMIT 1",[leadId]);
    const lead=rows[0];
    if(!lead)return res.status(404).json({ok:false,error:"Candidate not found."});
    if(lead.display_rights!==true || lead.county_verified!==true || !["01001","01051","01085","01101"].includes(String(lead.county_fips||"").trim()))
      return res.status(409).json({ok:false,error:"Owner authorization cannot be recorded until feed display rights and street-address county verification pass independently."});
    await db.query("UPDATE scout_leads SET owner_authorized=TRUE,owner_authorization_reference=$1,owner_authorized_at=now(),updated_at=now() WHERE id=$2",[reference,leadId]);
    await db.query("INSERT INTO review_audits (target_type,target_id,reviewer_model,decision,county_fips,display_rights_verified,owner_authorized_verified,reasons) VALUES ('scout_lead',$1,'admin_owner_authorization_review','held',$2,TRUE,TRUE,$3::jsonb)",[leadId,lead.county_fips,JSON.stringify(["owner_authorization_reference_recorded_by_admin","awaiting_publish_action"])]);
    return res.json({ok:true,ownerAuthorized:true,message:"Owner authorization recorded separately from source display rights. Publication remains a separate action."});
  }

  if (b.action === "publish") {
    const leadId=Number(b.id);
    if(!Number.isInteger(leadId)||leadId<=0)return res.status(400).json({ok:false,error:"Invalid candidate id."});
    const {rows}=await db.query("SELECT * FROM scout_leads WHERE id=$1 LIMIT 1",[leadId]);
    const lead=rows[0];
    if(!lead)return res.status(404).json({ok:false,error:"Candidate not found."});
    if(lead.review_status==="rejected"||lead.review_status==="stale")return res.status(409).json({ok:false,error:"Rejected or stale candidates cannot be published."});
    const gate=evaluateRiverRegion({...lead,county_verified:lead.county_verified===true});
    if(!gate.eligible || !lead.owner_authorization_reference)return res.status(403).json({ok:false,error:"Publication requires independent display rights, recorded owner authorization, and Census-verified FIPS in the four-county River Region.",reasons:gate.reasons});
    if(!lead.last_checked_at||Date.now()-new Date(lead.last_checked_at).getTime()>48*60*60*1000)return res.status(409).json({ok:false,error:"Candidate is older than 48 hours. Wait for a successful feed refresh before publishing."});
    if(!["rent","sale"].includes(lead.listing_type))return res.status(409).json({ok:false,error:"Unsupported listing type."});
    if(!lead.address||!lead.city||!lead.state||!lead.price_cents||lead.price_cents<=0||lead.bedrooms==null||lead.bathrooms==null||(lead.listing_type==="rent"&&(lead.sqft==null||lead.sqft<=0)))
      return res.status(409).json({ok:false,error:"Listing is missing required address, price, bedroom, or bathroom facts. Rentals also need square footage."});
    const imageUrls=(Array.isArray(lead.image_urls)?lead.image_urls:[]).map(https).filter(Boolean).slice(0,12);
    const slug=slugify(lead.title+" "+lead.city+" "+lead.state)+"-"+lead.id;
    const existing=await db.query("SELECT id FROM homes WHERE source_url=$1 AND external_listing=true LIMIT 1",[lead.source_url]);
    let home;
    if(existing.rows.length){
      const updated=await db.query("UPDATE homes SET listing_type=$1,title=$2,address=$3,city=$4,state=$5,zip=$6,rent_cents=$7,sale_price_cents=$8,deposit_cents=$9,bedrooms=$10,bathrooms=$11,sqft=$12,property_type=$13,description=$14,image_url=$15,image_urls=$16::jsonb,features='[]'::jsonb,is_available=true,listing_status='available',status_updated_at=now(),status_note='Published after independent rights and county review.',source_url=$17,source_name=$18,external_listing=true,available_from='Verify current terms at source',county=$20,county_fips=$21,display_rights=true,owner_authorized=true,owner_authorized_at=now(),authorization_note=$22,last_verified_at=now(),source_status='verified' WHERE id=$19 RETURNING id,slug,title",[lead.listing_type,lead.title,lead.address,lead.city,lead.state,clean(lead.zip,20),lead.listing_type==="rent"?lead.price_cents:0,lead.listing_type==="sale"?lead.price_cents:null,lead.listing_type==="rent"?lead.price_cents:0,lead.bedrooms,lead.bathrooms,lead.sqft||0,lead.property_type==="single family"?"Single-family home":clean(lead.property_type,100)||"House",clean(lead.notes,1500)||"Source-linked listing. Confirm current terms at the source.",imageUrls[0]||"",JSON.stringify(imageUrls),lead.source_url,lead.source_name,existing.rows[0].id,lead.county,lead.county_fips,lead.owner_authorization_reference]);
      home=updated.rows[0];
    } else {
      const inserted=await db.query("INSERT INTO homes (slug,title,address,city,state,zip,rent_cents,deposit_cents,sale_price_cents,bedrooms,bathrooms,sqft,listing_type,property_type,description,image_url,image_urls,features,pets_allowed,available_from,is_available,featured,listing_status,status_updated_at,status_note,source_url,source_name,external_listing,county,county_fips,display_rights,owner_authorized,owner_authorized_at,authorization_note,last_verified_at,source_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,'[]'::jsonb,false,'Verify current terms at source',true,false,'available',now(),'Published after independent rights and county review.',$18,$19,true,$20,$21,true,true,now(),$22,now(),'verified') RETURNING id,slug,title",[slug,lead.title,lead.address,lead.city,lead.state,clean(lead.zip,20),lead.listing_type==="rent"?lead.price_cents:0,lead.listing_type==="rent"?lead.price_cents:0,lead.listing_type==="sale"?lead.price_cents:null,lead.bedrooms,lead.bathrooms,lead.sqft||0,lead.listing_type,lead.property_type==="single family"?"Single-family home":clean(lead.property_type,100)||"House",clean(lead.notes,1500)||"Source-linked listing. Confirm current terms at the source.",imageUrls[0]||"",JSON.stringify(imageUrls),lead.source_url,lead.source_name,lead.county,lead.county_fips,lead.owner_authorization_reference]);
      home=inserted.rows[0];
    }
    await db.query("UPDATE scout_leads SET review_status='published',source_status='published',last_checked_at=now(),updated_at=now() WHERE id=$1",[leadId]);
    await db.query("INSERT INTO review_audits (target_type,target_id,reviewer_model,decision,county_fips,display_rights_verified,owner_authorized_verified,reasons) VALUES ('home',$1,'admin_publish_gate','approved',$2,TRUE,TRUE,$3::jsonb)",[home.id,lead.county_fips,JSON.stringify(['four_county_census_geocode_verified','source_display_rights_verified','owner_authorization_reference_recorded'])]);
    return res.json({ok:true,home,message:"Added to public KeyCounty listings."});
  }

  if (b.action === "review") {
    const leadId=Number(b.id), status=clean(b.reviewStatus,30);
    if(!Number.isInteger(leadId)||leadId<=0||!["needs_review","verified","rejected","stale"].includes(status))
      return res.status(400).json({ok:false,error:"Invalid candidate review status."});
    await db.query("UPDATE scout_leads SET review_status=$1,notes=COALESCE($2,notes),last_checked_at=CASE WHEN $1='verified' THEN now() ELSE last_checked_at END,updated_at=now(),source_status=CASE WHEN $1='stale' THEN 'stale' WHEN $1='verified' THEN 'manually_verified' ELSE source_status END WHERE id=$3",[status,b.notes==null?null:clean(b.notes,1000),leadId]);
    return res.json({ok:true});
  }

  if (b.action === "check") {
    const leadId=Number(b.id);
    if(!Number.isInteger(leadId)||leadId<=0)return res.status(400).json({ok:false,error:"Invalid candidate id."});
    const {rows}=await db.query("UPDATE scout_leads SET updated_at=now(),review_status=CASE WHEN review_status IN ('published','rejected') THEN review_status ELSE 'needs_review' END WHERE id=$1 RETURNING id",[leadId]);
    if(!rows.length)return res.status(404).json({ok:false,error:"Candidate not found."});
    return res.json({ok:true,message:"Candidate returned to the review queue. Source refresh is handled by the scheduled feed job."});
  }

  return res.status(400).json({ok:false,error:"Unknown scout action."});
}