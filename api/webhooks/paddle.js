import { db, config, webhooks } from "hatchable";

export const access = "public";
export const methods = ["POST"];

export default async function (req, res) {
  let secret;
  try { secret = await config.get("PADDLE_WEBHOOK_SECRET"); } catch (_) {}
  if (!secret || !req.rawBody) return res.status(503).json({ error: "Paddle webhook signing secret is not configured." });

  const header = String(req.headers?.["paddle-signature"] || "");
  let timestamp = "";
  let signature = "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "ts") timestamp = value;
    if (key === "h1") signature = value;
  }
  if (!/^\d+$/.test(timestamp) || !signature) return res.status(400).json({ error: "Missing or malformed Paddle signature." });
  let verified = false;
  try {
    verified = await webhooks.verifyHmac({
      raw: timestamp + ":" + req.rawBody,
      signature,
      secret,
      algorithm: "sha256",
      encoding: "hex",
      timestamp,
      tolerance: 300
    });
  } catch (_) {}
  if (!verified) return res.status(400).json({ error: "Invalid Paddle signature." });

  const event = req.body || {};
  if (event.event_type !== "transaction.completed") return res.json({ received: true, ignored: true });
  const transaction = event.data || {};
  const referenceCode = String(transaction.custom_data?.reference_code || "").trim();
  const transactionId = String(transaction.id || "").trim();
  const amount = Number(transaction.details?.totals?.subtotal);
  const currency = String(transaction.currency_code || "").toUpperCase();
  if (!/^(KC|RA)-[A-Z0-9-]{8,80}$/.test(referenceCode) ||
      !/^txn_[a-z0-9]+$/i.test(transactionId) ||
      !Number.isSafeInteger(amount) || amount <= 0 || currency !== "USD" ||
      !["completed", "paid"].includes(String(transaction.status || "").toLowerCase())) {
    return res.json({ received: true, ignored: true });
  }

  const isConnection = referenceCode.startsWith("KC-");
  const table = isConnection ? "connection_requests" : "applications";
  const { rows: records } = await db.query(
    "SELECT id,fee_cents,payment_status FROM " + table + " WHERE reference_code=$1",
    [referenceCode]
  );
  const record = records[0];
  if (!record || Number(record.fee_cents) !== amount) return res.json({ received: true, ignored: true });

  const { rows: updated } = await db.query(
    "UPDATE " + table + " SET payment_status='paid',payment_method='paddle',payment_reference=$1,paid_at=COALESCE(paid_at,now()),status=CASE WHEN $2='applications' AND status='awaiting_payment' THEN 'under_review' WHEN $2='connection_requests' THEN 'paid' ELSE status END,updated_at=now() WHERE id=$3 AND fee_cents=$4 AND payment_status='unpaid' RETURNING id",
    [transactionId, table, record.id, amount]
  );
  if (!updated.length) {
    const { rows: existing } = await db.query(
      "SELECT id FROM " + table + " WHERE id=$1 AND payment_reference=$2 AND payment_status='paid'",
      [record.id, transactionId]
    );
    if (!existing.length) return res.status(409).json({ received: false, error: "Payment could not be reconciled." });
  }
  if (!isConnection && updated.length) {
    await db.query(
      "INSERT INTO payment_audit_log (application_id,action,payment_method,payment_reference,amount_cents,recorded_by,details) VALUES ($1,'provider_confirmed','paddle',$2,$3,'paddle-webhook',$4)",
      [record.id, transactionId, amount, "Verified Paddle transaction.completed event " + String(event.event_id || event.notification_id || "")]
    );
  }
  return res.json({ received: true, updated: updated.length === 1 });
}