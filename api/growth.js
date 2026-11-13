import { db } from "hatchable";

export const access = "admin";
export const methods = ["GET"];

export default async function (req,res) {
  const [inventory,markets,events,sources,leads,paid,submissions,pulses,traffic,channels,health,incidents] = await Promise.all([
    db.query("SELECT count(*) FILTER (WHERE is_available=true AND listing_status='available' AND status_updated_at >= now()-interval '24 hours')::int AS total,count(*) FILTER (WHERE is_available=true AND listing_status='available' AND status_updated_at >= now()-interval '24 hours' AND listing_type='rent')::int AS rentals,count(*) FILTER (WHERE is_available=true AND listing_status='available' AND status_updated_at >= now()-interval '24 hours' AND listing_type='sale')::int AS sales,count(*) FILTER (WHERE listing_status='hidden' AND status_note LIKE 'Auto-hidden because listing status was not re-confirmed%')::int AS stale FROM homes"),
    db.query("SELECT city,state,listing_type,count(*)::int AS count FROM homes WHERE is_available=true AND listing_status='available' AND status_updated_at >= now()-interval '24 hours' GROUP BY city,state,listing_type ORDER BY city,state,listing_type"),
    db.query("SELECT event_name,count(*)::int AS count FROM growth_events WHERE created_at >= now()-interval '7 days' GROUP BY event_name ORDER BY count DESC"),
    db.query("SELECT id,source_name,enabled,rights_status,last_checked_at,last_error FROM scout_sources ORDER BY enabled DESC,source_name"),
    db.query("SELECT count(*) FILTER (WHERE consent_to_contact=true AND created_at>=now()-interval '24 hours')::int AS new_24h,count(*) FILTER (WHERE consent_to_contact=true AND created_at>=now()-interval '7 days')::int AS new_7d,count(*) FILTER (WHERE consent_to_contact=true AND status='new')::int AS open FROM area_search_leads"),
    db.query("SELECT count(*) FILTER (WHERE payment_status='paid')::int AS paid_total,count(*) FILTER (WHERE payment_status='paid' AND (admin_notified_at IS NULL OR fulfillment_status='needs_follow_up'))::int AS paid_followups_due,count(*) FILTER (WHERE payment_status='paid' AND paid_at>=now()-interval '7 days')::int AS paid_7d FROM connection_requests"),
    db.query("SELECT count(*) FILTER (WHERE status NOT IN ('published','rejected'))::int AS pending_review,count(*) FILTER (WHERE created_at>=now()-interval '7 days')::int AS submitted_7d FROM listing_submissions"),
    db.query("SELECT id,ran_at,run_status,inventory,metrics,issues,content_drafts,email_sent,email_error FROM growth_pulse_log ORDER BY ran_at DESC LIMIT 10"),
    db.query("SELECT count(*) FILTER (WHERE event_name='page_view' AND created_at>=now()-interval '24 hours')::int AS page_views_24h,count(*) FILTER (WHERE event_name='page_view' AND created_at>=now()-interval '7 days')::int AS page_views_7d,count(DISTINCT event_metadata->>'visitorSession') FILTER (WHERE event_name='page_view' AND created_at>=now()-interval '7 days')::int AS unique_sessions_7d FROM growth_events"),
    db.query("SELECT COALESCE(NULLIF(utm_source,''),NULLIF(event_metadata->>'referrerHost',''),'direct') AS channel,count(*) FILTER (WHERE event_name='page_view')::int AS views,count(DISTINCT event_metadata->>'visitorSession') FILTER (WHERE event_name='page_view')::int AS sessions FROM growth_events WHERE created_at>=now()-interval '7 days' GROUP BY 1 ORDER BY views DESC LIMIT 20"),
    db.query("SELECT id,checked_at,overall_status,checks FROM system_health_checks ORDER BY checked_at DESC LIMIT 1"),
    db.query("SELECT component,severity,status,summary,last_seen_at,occurrences FROM system_incidents ORDER BY (status='open') DESC,last_seen_at DESC LIMIT 20")
  ]);
  return res.json({
    generatedAt:new Date().toISOString(),
    inventory:inventory.rows[0]||{total:0,rentals:0,sales:0,stale:0},
    markets:markets.rows,
    events7d:events.rows,
    sources:sources.rows,
    areaLeads:leads.rows[0]||{new_24h:0,new_7d:0,open:0},
    paidRequests:paid.rows[0]||{paid_total:0,paid_followups_due:0,paid_7d:0},
    listingSubmissions:submissions.rows[0]||{pending_review:0,submitted_7d:0},
    pulses:pulses.rows,
    traffic:traffic.rows[0]||{page_views_24h:0,page_views_7d:0,unique_sessions_7d:0},
    channels7d:channels.rows,
    health:health.rows[0]||null,
    incidents:incidents.rows
  });
}