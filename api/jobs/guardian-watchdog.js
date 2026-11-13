import { db, scheduler } from "hatchable";

export const access = "scheduler";
export const methods = ["POST"];

export default async function (req, res) {
  try {
    const result = await db.query("SELECT checked_at FROM system_health_checks ORDER BY checked_at DESC LIMIT 1");
    const last = result.rows?.[0]?.checked_at ? new Date(result.rows[0].checked_at) : null;
    const ageMinutes = last ? Math.round((Date.now() - last.getTime()) / 60000) : null;
    if (last && ageMinutes < 95) {
      return res.json({ ok: true, guardianFresh: true, ageMinutes, recovered: false });
    }

    const reason = last ? "Guardian check is stale (" + ageMinutes + " minutes)." : "Guardian has never completed a check.";
    await db.query("INSERT INTO system_incidents (fingerprint,component,severity,summary) VALUES ('guardian:heartbeat','guardian_watchdog','critical',$1) ON CONFLICT (fingerprint) DO UPDATE SET status='open',summary=EXCLUDED.summary,last_seen_at=now(),occurrences=system_incidents.occurrences+1,resolved_at=NULL", [reason]);

    await scheduler.now("/api/jobs/guardian");
    await db.query("UPDATE system_incidents SET status='resolved',resolved_at=now(),summary='Guardian was re-invoked by the independent scheduled watchdog.' WHERE fingerprint='guardian:heartbeat' AND status='open'");
    return res.json({ ok: true, guardianFresh: false, ageMinutes, recovered: true, action: "guardian_reinvoked" });
  } catch (e) {
    const message = String(e?.message || e).replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 300);
    console.error("Guardian watchdog failed", message);
    return res.status(503).json({ ok: false, error: message });
  }
}