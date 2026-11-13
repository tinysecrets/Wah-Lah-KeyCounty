import { db } from "hatchable";

export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  try {
    const result = await db.query("SELECT checked_at,overall_status,(checked_at >= now()-interval '95 minutes') AS fresh FROM system_health_checks ORDER BY checked_at DESC LIMIT 1");
    const latest = result.rows?.[0];
    if (!latest) return res.status(503).json({ ok: false, service: "keycounty", status: "unknown", reason: "No guardian check has completed." });
    const fresh = Boolean(latest.fresh);
    if (!fresh) return res.status(503).json({ ok: false, service: "keycounty", status: "stale", reason: "Guardian heartbeat is overdue." });
    const critical = latest.overall_status === "critical";
    return res.status(critical ? 503 : 200).json({
      ok: !critical,
      service: "keycounty",
      status: latest.overall_status,
      guardianFresh: true,
      checkedAt: latest.checked_at
    });
  } catch (e) {
    console.error("Public health probe failed", String(e?.message || e));
    return res.status(503).json({ ok: false, service: "keycounty", status: "unavailable" });
  }
}