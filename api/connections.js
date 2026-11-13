import { db } from "hatchable";

export const access = "admin";
export const methods = ["GET", "POST"];

const clean = (v, n = 500) => String(v ?? "").trim().slice(0, n);

export default async function (req, res) {
  if (req.method === "GET") {
    const { rows } = await db.query(
      "SELECT cr.id,cr.reference_code,cr.full_name,cr.email,cr.phone,cr.preferred_contact,cr.message,cr.fee_cents,cr.status,cr.payment_status,cr.payment_method,cr.payment_reference,cr.paid_at,cr.admin_notified_at,cr.fulfillment_status,cr.created_at,h.title,h.address,h.city,h.state,h.listing_type,h.source_name,h.source_url FROM connection_requests cr JOIN homes h ON h.id=cr.home_id ORDER BY CASE WHEN cr.payment_status='paid' AND cr.fulfillment_status='needs_follow_up' THEN 0 WHEN cr.payment_status='paid' THEN 1 ELSE 2 END,cr.created_at DESC LIMIT 250"
    );
    return res.json({ requests: rows });
  }

  const id = Number(req.body?.id);
  const action = clean(req.body?.action, 30);
  const permitted = ["contacted", "completed", "unable_to_connect"];
  if (!Number.isSafeInteger(id) || id <= 0 || !permitted.includes(action)) {
    return res.status(400).json({ ok: false, error: "Choose a valid request and follow-up status." });
  }

  const { rows } = await db.query(
    "UPDATE connection_requests SET fulfillment_status=$1,status=CASE WHEN $1='contacted' THEN 'contacted' WHEN $1='completed' THEN 'completed' WHEN $1='unable_to_connect' THEN 'cancelled' ELSE status END,updated_at=now() WHERE id=$2 AND payment_status='paid' RETURNING id,reference_code,fulfillment_status,status",
    [action, id]
  );
  if (!rows.length) {
    const { rows: existing } = await db.query("SELECT payment_status FROM connection_requests WHERE id=$1", [id]);
    if (!existing.length) return res.status(404).json({ ok: false, error: "Connection request not found." });
    return res.status(409).json({ ok: false, error: "This request cannot be worked until its payment is confirmed." });
  }
  return res.json({ ok: true, request: rows[0] });
}