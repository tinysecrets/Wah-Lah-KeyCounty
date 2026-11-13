import { db } from "hatchable";

export const access = "admin";
export const methods = ["GET", "POST"];

const clean = (v, max = 1000) => String(v ?? "").trim().slice(0, max);

export default async function (req, res) {
  if (req.method === "GET") {
    const { rows } = await db.query(
      "SELECT id,full_name,email,phone,requested_area,listing_type,max_price_cents,min_bedrooms,message,consent_to_contact,status,admin_notes,contacted_at,created_at,updated_at FROM area_search_leads ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'contacted' THEN 1 WHEN 'matched' THEN 2 ELSE 3 END,created_at DESC LIMIT 500"
    );
    return res.json({ leads: rows });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed." });
  const id = Number(req.body?.id);
  const action = clean(req.body?.action, 20);
  const note = clean(req.body?.note, 1000);
  if (!Number.isSafeInteger(id) || id <= 0 || !["contacted", "matched", "closed", "new"].includes(action)) {
    return res.status(400).json({ ok: false, error: "Choose a valid lead and status." });
  }
  const { rows } = await db.query(
    "UPDATE area_search_leads SET status=$1,admin_notes=CASE WHEN $2<>'' THEN $2 ELSE admin_notes END,contacted_at=CASE WHEN $1='contacted' THEN COALESCE(contacted_at,now()) ELSE contacted_at END,updated_at=now() WHERE id=$3 RETURNING id,status,updated_at",
    [action,note,id]
  );
  if (!rows.length) return res.status(404).json({ ok: false, error: "Housing request not found." });
  return res.json({ ok: true, lead: rows[0] });
}