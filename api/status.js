import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  const code = String(req.query?.code || "").trim().toUpperCase();
  const email = String(req.query?.email || "").trim().toLowerCase();
  if (!code || !email) return res.status(400).json({ error: "Reference code and email are required." });

  const { rows: applications } = await db.query(
    "SELECT a.reference_code,a.status,a.payment_status,a.payment_method,a.payment_reference,a.settlement_status,a.settlement_reference,a.payout_status,a.payout_recipient,a.payout_reference,a.payout_at,a.created_at,h.title,h.city,h.state,'application' AS service_type FROM applications a JOIN homes h ON h.id=a.home_id WHERE upper(a.reference_code)=$1 AND lower(a.email)=$2",
    [code, email]
  );
  if (applications[0]) return res.json(applications[0]);

  const { rows: connections } = await db.query(
    "SELECT cr.reference_code,cr.status,cr.payment_status,cr.payment_method,cr.payment_reference,cr.created_at,cr.paid_at,cr.fulfillment_status,h.title,h.city,h.state,'home_connection' AS service_type FROM connection_requests cr JOIN homes h ON h.id=cr.home_id WHERE upper(cr.reference_code)=$1 AND lower(cr.email)=$2",
    [code, email]
  );
  if (!connections[0]) return res.status(404).json({ error: "No request matched that reference code and email." });

  return res.json({
    ...connections[0],
    settlement_status: "not_applicable",
    payout_status: "not_applicable"
  });
}