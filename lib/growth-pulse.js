import { db, email, config } from "hatchable";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = cents => "$" + (Number(cents || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
const clean = (v,n=500) => String(v ?? "").replace(/\s+/g," ").trim().slice(0,n);

export async function runGrowthPulse() {
  const issues = [];
  let emailSent = false;
  let emailError = null;
  try {
    const [inventoryResult, metricResult, sourceResult, eventResult, cityResult] = await Promise.all([
      db.query("SELECT id,title,address,city,state,listing_type,rent_cents,sale_price_cents,bedrooms,bathrooms,sqft,image_url,image_urls,source_url,source_name,description,status_updated_at FROM homes WHERE is_available=true AND listing_status='available' AND status_updated_at >= now() - interval '24 hours' ORDER BY status_updated_at DESC,id DESC LIMIT 50"),
      db.query("SELECT (SELECT count(*)::int FROM area_search_leads WHERE consent_to_contact=true AND created_at >= now()-interval '24 hours') AS area_leads_24h,(SELECT count(*)::int FROM area_search_leads WHERE consent_to_contact=true AND created_at >= now()-interval '7 days') AS area_leads_7d,(SELECT count(*)::int FROM connection_requests WHERE payment_status='paid' AND paid_at >= now()-interval '24 hours') AS paid_connections_24h,(SELECT count(*)::int FROM connection_requests WHERE payment_status='paid' AND (admin_notified_at IS NULL OR fulfillment_status='needs_follow_up')) AS paid_followups_due,(SELECT count(*)::int FROM listing_submissions WHERE created_at >= now()-interval '24 hours' AND status NOT IN ('published','rejected')) AS pending_listing_submissions,(SELECT count(*)::int FROM growth_events WHERE created_at >= now()-interval '24 hours' AND event_name='page_view') AS page_views_24h,(SELECT count(*)::int FROM growth_events WHERE created_at >= now()-interval '7 days' AND event_name='page_view') AS page_views_7d,(SELECT count(*)::int FROM growth_events WHERE created_at >= now()-interval '7 days' AND event_name='checkout_opened') AS checkout_opens_7d,(SELECT count(*)::int FROM growth_events WHERE created_at >= now()-interval '7 days' AND event_name='connection_request_saved') AS connection_starts_7d,(SELECT count(*)::int FROM growth_events WHERE created_at >= now()-interval '7 days' AND event_name='area_request_submitted') AS area_requests_7d,(SELECT count(*)::int FROM growth_events WHERE created_at >= now()-interval '7 days' AND event_name='owner_listing_submitted') AS owner_submissions_7d"),
      db.query("SELECT source_name,enabled,rights_status,last_checked_at,last_error FROM scout_sources ORDER BY enabled DESC,source_name ASC"),
      db.query("SELECT event_name,count(*)::int AS count FROM growth_events WHERE created_at >= now()-interval '7 days' GROUP BY event_name ORDER BY count DESC"),
      db.query("SELECT city,state,listing_type,count(*)::int AS count FROM homes WHERE is_available=true AND listing_status='available' AND status_updated_at >= now()-interval '24 hours' GROUP BY city,state,listing_type ORDER BY city,state,listing_type")
    ]);
    const homes = inventoryResult.rows || [];
    const metrics = metricResult.rows[0] || {};
    const sources = sourceResult.rows || [];
    const activeSources = sources.filter(s => s.enabled && s.rights_status === "display_allowed");
    const brokenSources = activeSources.filter(s => s.last_error);
    const inventory = {
      total: homes.length,
      rent: homes.filter(h => h.listing_type === "rent").length,
      sale: homes.filter(h => h.listing_type === "sale").length,
      markets: cityResult.rows || []
    };

    if (!homes.length) issues.push({level:"critical",task:"Restore current inventory before sending home-seeker marketing",detail:"No listings passed the current-availability freshness check in the last 24 hours."});
    if (!inventory.rent) issues.push({level:"high",task:"Secure verified rental/lease inventory",detail:"There are currently no fresh public rentals/leases in the live marketplace."});
    if (brokenSources.length) issues.push({level:"high",task:"Repair or replace failed listing feeds",detail:brokenSources.map(s=>clean(s.source_name)+": "+clean(s.last_error)).join("; ")});
    if (!(metrics.area_leads_24h > 0) && !(metrics.page_views_24h > 0)) issues.push({level:"high",task:"Start measurable distribution",detail:"No tracked page views or consented area-request leads were recorded in the previous 24 hours."});
    if (metrics.paid_followups_due > 0) issues.push({level:"critical",task:"Fulfill paid requests first",detail:String(metrics.paid_followups_due)+" paid request(s) need attention."});
    if (!sources.some(s=>s.enabled && s.rights_status==="display_allowed")) issues.push({level:"high",task:"Add an authorized, display-cleared listing feed",detail:"The scout cannot discover new displayable inventory without an authorized source."});
    issues.push({level:"normal",task:"Recruit inventory partners",detail:"Contact a small daily batch of property owners and managers; request written permission for listing fields and photos."});
    issues.push({level:"normal",task:"Publish one useful, accurate housing post",detail:"Use only current, display-cleared listings; link people back to the corresponding KeyCounty page and do not promise availability or outcomes."});

    const drafts = homes.filter(h => h.image_url || (Array.isArray(h.image_urls) && h.image_urls.length)).slice(0,3).map(h => {
      const sale = h.listing_type === "sale";
      const price = money(sale ? h.sale_price_cents : h.rent_cents) + (sale ? " asking price" : " per month");
      const photo = h.image_url || (Array.isArray(h.image_urls) ? h.image_urls[0] : "");
      const caption = "Exploring homes in " + clean(h.city) + ", " + clean(h.state) + "? Take a look at " + clean(h.title,180) + " — " + price + ", " + Number(h.bedrooms||0) + " bed / " + Number(h.bathrooms||0) + " bath. View the listing details on Wah-Lah KeyCounty, then confirm the current price, availability, and terms with the original source. Browse free.";
      const url = "https://wah-lah-keycounty.hatchable.site/listing/?id=" + h.id + "&utm_source=organic_social&utm_medium=social&utm_campaign=keycounty_daily_marketplace";
      return {listingId:h.id,title:h.title,area:clean(h.city)+", "+clean(h.state),caption,url,originalSource:h.source_url,sourceName:h.source_name,photoUrl:photo,photoReuse:"Use the photo in a social post only if the source permission explicitly covers that use; otherwise share the KeyCounty link without re-uploading it."};
    });

    if (homes.length && !drafts.length) issues.push({level:"high",task:"Add real display-cleared listing photos",detail:"Fresh listings exist, but none of them has a usable photo for a property spotlight."});
    const dateLabel = new Date().toISOString().slice(0,10);
    const subject = "KeyCounty daily growth pulse — " + dateLabel;
    const lines = [
      "WAH-LAH KEYCOUNTY — DAILY GROWTH PULSE",
      "Run date (UTC): " + dateLabel,
      "",
      "CURRENT FRESH INVENTORY",
      "Total: " + inventory.total + " | For rent/lease: " + inventory.rent + " | For sale: " + inventory.sale,
      "Markets: " + (inventory.markets.map(m=>m.city+", "+m.state+" ("+m.listing_type+": "+m.count+")").join("; ") || "None"),
      "",
      "FUNNEL — RECENT MEASUREMENTS",
      "Page views, last 24h: " + Number(metrics.page_views_24h||0),
      "Page views, last 7d: " + Number(metrics.page_views_7d||0),
      "Consent-based area requests, last 24h: " + Number(metrics.area_leads_24h||0),
      "Consent-based area requests, last 7d: " + Number(metrics.area_leads_7d||0),
      "Checkout starts, last 7d: " + Number(metrics.checkout_opens_7d||0),
      "Connection-request saves, last 7d: " + Number(metrics.connection_starts_7d||0),
      "Paid connection requests, last 24h: " + Number(metrics.paid_connections_24h||0),
      "Paid requests needing follow-up: " + Number(metrics.paid_followups_due||0),
      "Pending owner/property submissions from last 24h: " + Number(metrics.pending_listing_submissions||0),
      "",
      "SOURCE HEALTH",
      ...sources.map(s=>(s.enabled?"Enabled":"Disabled")+" — "+clean(s.source_name)+" — "+(s.last_error?"ERROR: "+clean(s.last_error):("last checked "+(s.last_checked_at||"never")))),
      "",
      "TODAY'S PRIORITIES",
      ...issues.map((x,i)=>(i+1)+". ["+x.level.toUpperCase()+"] "+x.task+" — "+x.detail),
      "",
      "CONTENT DRAFTS",
      ...(drafts.length?drafts.flatMap((d,i)=>[(i+1)+". "+d.title,d.caption,"Link: "+d.url,"Original source: "+d.originalSource,d.photoReuse,""]):["No property spotlight draft generated: no fresh public listing with photos was found."]),
      "",
      "Note: these are real counts from KeyCounty's current data. Zero counts mean no events were recorded; they do not mean demand was measured and found to be zero. Drafts are not published automatically."
    ];
    const textBody = lines.join("\n");
    const htmlBody = "<h2>Wah-Lah KeyCounty — daily growth pulse</h2><p><strong>Run date:</strong> "+esc(dateLabel)+" UTC</p><h3>Fresh inventory</h3><p>"+inventory.total+" total · "+inventory.rent+" rental/lease · "+inventory.sale+" for sale</p><ul>"+inventory.markets.map(m=>"<li>"+esc(m.city)+", "+esc(m.state)+" — "+esc(m.listing_type)+": "+m.count+"</li>").join("")+"</ul><h3>Funnel metrics</h3><ul>"+[
      ["Page views, 24h",metrics.page_views_24h],["Page views, 7d",metrics.page_views_7d],["Area requests, 24h",metrics.area_leads_24h],["Area requests, 7d",metrics.area_leads_7d],["Checkout starts, 7d",metrics.checkout_opens_7d],["Connection saves, 7d",metrics.connection_starts_7d],["Paid requests, 24h",metrics.paid_connections_24h],["Paid requests needing follow-up",metrics.paid_followups_due],["Recent owner submissions",metrics.pending_listing_submissions]
    ].map(([k,v])=>"<li>"+esc(k)+": <strong>"+Number(v||0)+"</strong></li>").join("")+"</ul><h3>Today's priorities</h3><ol>"+issues.map(x=>"<li><strong>["+esc(x.level.toUpperCase())+"] "+esc(x.task)+"</strong> — "+esc(x.detail)+"</li>").join("")+"</ol><h3>Content drafts (not auto-published)</h3>"+(drafts.length?drafts.map(d=>"<article style='padding:12px;border:1px solid #ccc;margin:10px 0'><h4>"+esc(d.title)+"</h4><p>"+esc(d.caption)+"</p><p><a href='"+esc(d.url)+"'>Open KeyCounty campaign link</a> · <a href='"+esc(d.originalSource)+"'>Original listing source</a></p><p>"+esc(d.photoReuse)+"</p></article>").join(""):"<p>No photo-backed current listings available for a spotlight today.</p>")+"<p><em>Drafts are not published automatically. Confirm availability and permission before posting.</em></p><p><a href='https://wah-lah-keycounty.hatchable.site/__page/growth'>Open the KeyCounty Growth Center</a></p>";
    try {
      let resendKey = "";
      try { resendKey = String(await config.get("RESEND_API_KEY") || "").trim(); } catch (_) {}
      if (resendKey) {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {"Authorization":"Bearer " + resendKey,"Content-Type":"application/json"},
          body: JSON.stringify({
            from: "Wah-Lah KeyCounty <admin@wah-lah.com>",
            to: ["admin@wah-lah.com"],
            reply_to: "support@wah-lah.com",
            subject,
            text: textBody,
            html: htmlBody
          })
        });
        if (!response.ok) {
          const detail = clean(await response.text(), 300);
          throw new Error("Resend HTTP " + response.status + (detail ? ": " + detail : ""));
        }
        emailSent = true;
      } else {
        await email.send({to:"admin@wah-lah.com",subject,text:textBody,html:htmlBody});
        emailSent = true;
      }
    } catch (e) {
      emailError = clean(e?.message || e, 500);
      issues.push({level:"high",task:"Check daily pulse email delivery",detail:emailError});
    }
    const log = await db.query(
      "INSERT INTO growth_pulse_log (run_status,inventory,metrics,issues,content_drafts,email_sent,email_error) VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7) RETURNING id,ran_at",
      [emailSent?"completed":"email_failed",JSON.stringify(inventory),JSON.stringify(metrics),JSON.stringify(issues),JSON.stringify(drafts),emailSent,emailError]
    );
    return {ok:true,logId:log.rows[0]?.id,ranAt:log.rows[0]?.ran_at,emailSent,inventory,metrics,issues,draftCount:drafts.length};
  } catch (e) {
    const message = clean(e?.message || e, 500);
    try {
      await db.query("INSERT INTO growth_pulse_log (run_status,issues,email_sent,email_error) VALUES ('failed',$1::jsonb,false,$2)",[JSON.stringify([{level:"critical",task:"Growth pulse failed",detail:message}]),message]);
    } catch (_) {}
    throw new Error(message);
  }
}