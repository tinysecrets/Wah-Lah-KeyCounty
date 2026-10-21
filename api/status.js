import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  const code = String(req.query?.code || "").trim().toUpperCase();
  const email = String(req.query?.email || "").trim().toLowerCase();
  if (!code || !email) return res.status(400).json({ error: "Reference code and application email are required." });

  const { rows } = await db.query(
    "SELECT a.reference_code,a.status,a.payment_status,a.payment_method,a.payment_reference,a.settlement_status,a.settlement_reference,a.payout_status,a.payout_recipient,a.payout_reference,a.payout_at,a.created_at,h.title,h.city,h.state FROM applications a JOIN homes h ON h.id=a.home_id WHERE upper(a.reference_code)=$1 AND lower(a.email)=$2",
    [code, email]
  );
  if (!rows[0]) return res.status(404).json({ error: "No application matched that reference code and email." });
  return res.json(rows[0]);
}