import { db, config } from "hatchable";

export const access = "scheduler";
export const methods = ["POST"];

const safeError = value => String(value?.message || value || "unknown error").replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 240);

export default async function (req, res) {
  const checks = {};
  let overall = "ok";
  const record = (name, status, detail) => {
    checks[name] = { status, detail };
    if (status === "critical") overall = "critical";
    else if (status === "warning" && overall === "ok") overall = "warning";
  };

  try {
    const ping = await db.query("SELECT now() AS database_time");
    record("database", ping.rows?.[0]?.database_time ? "ok" : "critical", "Database query completed.");
  } catch (e) {
    record("database", "critical", safeError(e));
  }

  try {
    await Promise.all([
      db.query("SELECT id FROM homes LIMIT 0"),
      db.query("SELECT event_id FROM growth_events LIMIT 0"),
      db.query("SELECT id FROM system_incidents LIMIT 0"),
      db.query("SELECT id FROM system_health_checks LIMIT 0")
    ]);
    record("schema", "ok", "Required marketplace, analytics, and resilience tables are queryable.");
  } catch (e) {
    record("schema", "critical", safeError(e));
  }

  try {
    const inventory = await db.query("SELECT count(*) FILTER (WHERE is_available=true AND listing_status='available' AND status_updated_at >= now()-interval '24 hours')::int AS fresh, count(*) FILTER (WHERE is_available=true AND listing_status='available')::int AS visible FROM homes");
    const fresh = Number(inventory.rows?.[0]?.fresh || 0);
    record("inventory", fresh > 0 ? "ok" : "warning", fresh > 0 ? fresh + " fresh public listing(s)." : "No listing passed the 24-hour freshness check; visitor demand should not be sent to empty inventory.");
  } catch (e) {
    record("inventory", "critical", safeError(e));
  }

  try {
    const traffic = await db.query("SELECT count(*) FILTER (WHERE event_name='page_view' AND created_at >= now()-interval '24 hours')::int AS views FROM growth_events");
    const views = Number(traffic.rows?.[0]?.views || 0);
    record("traffic_tracking", views > 0 ? "ok" : "warning", views > 0 ? views + " tracked page view(s) in the last 24 hours." : "No page views recorded in the last 24 hours; verify public access and acquisition links.");
  } catch (e) {
    record("traffic_tracking", "critical", safeError(e));
  }

  try {
    const feeds = await db.query("SELECT count(*) FILTER (WHERE enabled=true AND rights_status='display_allowed' AND last_error IS NOT NULL)::int AS failing, count(*) FILTER (WHERE enabled=true AND rights_status='display_allowed')::int AS active FROM scout_sources");
    const failing = Number(feeds.rows?.[0]?.failing || 0);
    record("listing_sources", failing ? "warning" : "ok", failing ? failing + " authorized feed(s) have a recorded error; the hourly scout retries eligible feeds." : "No authorized feed failures are currently recorded.");
  } catch (e) {
    record("listing_sources", "critical", safeError(e));
  }

  try {
    const apiKey = await config.get("STRIPE_SECRET_KEY");
    const webhook = await config.get("STRIPE_WEBHOOK_SECRET");
    const confirmed = String(await config.get("STRIPE_KEYCOUNTY_ACCOUNT_CONFIRMED") || "").trim().toLowerCase() === "yes";
    const liveKey = /^sk_live_[A-Za-z0-9]+$/.test(String(apiKey || "").trim());
    record("stripe_checkout_readiness", liveKey && webhook && confirmed ? "ok" : "warning", liveKey && webhook && confirmed ? "Live Stripe key, webhook, and owner-confirmed merchant/payout destination are present." : "Live checkout remains locked until the Stripe key, webhook, merchant profile, and payout destination are confirmed.");
  } catch (e) {
    record("stripe_checkout_readiness", "warning", "Stripe payment configuration could not be verified: " + safeError(e));
  }

  try {
    const pulse = await db.query("SELECT ran_at,email_sent,email_error,(ran_at >= now()-interval '26 hours') AS recent FROM growth_pulse_log ORDER BY ran_at DESC LIMIT 1");
    const latestPulse = pulse.rows?.[0];
    const pulseHealthy = Boolean(latestPulse?.email_sent) && Boolean(latestPulse?.recent);
    record("growth_email_delivery", pulseHealthy ? "ok" : "warning", pulseHealthy ? "Daily growth email was accepted by Resend within the last 26 hours." : (!latestPulse ? "No daily growth email has been recorded yet." : (!latestPulse.email_sent ? "Latest growth email failed: " + safeError(latestPulse.email_error) : "Last successful growth email is older than 26 hours.")));
  } catch (e) {
    record("growth_email_delivery", "critical", safeError(e));
  }

  try {
    const rows = await db.query("INSERT INTO system_health_checks (overall_status, checks) VALUES ($1,$2::jsonb) RETURNING id,checked_at", [overall, JSON.stringify(checks)]);
    for (const [component, item] of Object.entries(checks)) {
      const fingerprint = "guardian:" + component;
      if (item.status === "warning" || item.status === "critical") {
        await db.query("INSERT INTO system_incidents (fingerprint,component,severity,summary) VALUES ($1,$2,$3,$4) ON CONFLICT (fingerprint) DO UPDATE SET severity=EXCLUDED.severity,status='open',summary=EXCLUDED.summary,last_seen_at=now(),occurrences=system_incidents.occurrences+1,resolved_at=NULL", [fingerprint, component, item.status, item.detail]);
      } else {
        await db.query("UPDATE system_incidents SET status='resolved',resolved_at=now() WHERE fingerprint=$1 AND status='open'", [fingerprint]);
      }
    }
    return res.json({ ok: true, overall, checkId: rows.rows?.[0]?.id, checkedAt: rows.rows?.[0]?.checked_at, checks });
  } catch (e) {
    console.error("Guardian persistence failed", safeError(e));
    return res.status(503).json({ ok: false, overall, checks, persistenceError: safeError(e) });
  }
}