import { db, config, webhooks } from "hatchable";

export const access = "public";
export const methods = ["POST"];

const clean = (v, max=240) => String(v ?? "").replace(/[\r\n\u0000-\u001f]/g," ").trim().slice(0,max);

export default async function (req, res) {
  let secret = "";
  try { secret = String(await config.get("STRIPE_WEBHOOK_SECRET") || "").trim(); } catch (_) {}
  if (!secret) return res.status(503).json({error:"Stripe webhook signing secret is not configured."});
  if (!req.rawBody) return res.status(400).json({error:"The raw webhook body is required for signature verification."});

  const header = String(req.headers?.["stripe-signature"] || "");
  let timestamp = "";
  const signatures = [];
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0,index).trim();
    const value = part.slice(index+1).trim();
    if (key === "t") timestamp = value;
    if (key === "v1" && value) signatures.push(value);
  }
  if (!/^\d+$/.test(timestamp) || !signatures.length) return res.status(400).json({error:"Missing or malformed Stripe signature."});

  let verified = false;
  for (const signature of signatures) {
    try {
      verified = await webhooks.verifyHmac({
        raw: timestamp + ":" + req.rawBody,
        signature,
        secret,
        algorithm:"sha256",
        encoding:"hex",
        timestamp,
        tolerance:300
      });
      if (verified) break;
    } catch (_) {}
  }
  if (!verified) return res.status(400).json({error:"Invalid Stripe signature."});

  const event = req.body || {};
  if (!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)) {
    return res.json({received:true,ignored:true});
  }

  const session = event.data?.object || {};
  const referenceCode = clean(session.client_reference_id || session.metadata?.reference_code,90);
  const sessionId = clean(session.id,100);
  const amount = Number(session.amount_total);
  const currency = String(session.currency || "").toLowerCase();
  const paid = session.payment_status === "paid";
  if (!paid || !/^cs_live_[A-Za-z0-9]+$/.test(sessionId) ||
      !/^(KC|RA)-[A-Z0-9-]{8,80}$/.test(referenceCode) ||
      !Number.isSafeInteger(amount) || amount<=0 || currency!=="usd") {
    return res.json({received:true,ignored:true});
  }

  const isConnection = referenceCode.startsWith("KC-");
  const table = isConnection ? "connection_requests" : "applications";
  const {rows} = await db.query(
    "SELECT id,fee_cents,payment_status,payment_reference FROM " + table + " WHERE reference_code=$1",
    [referenceCode]
  );
  const record = rows[0];
  if (!record || Number(record.fee_cents)!==amount) return res.json({received:true,ignored:true});
  if (record.payment_status==="paid" && record.payment_reference===sessionId) {
    return res.json({received:true,updated:false,idempotent:true});
  }

  const updateSql = isConnection
    ? "UPDATE connection_requests SET payment_status='paid',payment_method='stripe',payment_reference=$1,stripe_session_id=$1,paid_at=COALESCE(paid_at,now()),status='paid',updated_at=now() WHERE id=$2 AND payment_status='unpaid' AND (stripe_session_id IS NULL OR stripe_session_id=$1 OR payment_reference=$1) RETURNING id"
    : "UPDATE applications SET payment_status='paid',payment_method='stripe',payment_reference=$1,paid_at=COALESCE(paid_at,now()),status=CASE WHEN status='awaiting_payment' THEN 'under_review' ELSE status END,updated_at=now() WHERE id=$2 AND payment_status='unpaid' AND (payment_reference IS NULL OR payment_reference=$1) RETURNING id";
  const {rows:updated} = await db.query(updateSql,[sessionId,record.id]);
  if (!updated.length) {
    const {rows:existing} = await db.query("SELECT id FROM " + table + " WHERE id=$1 AND payment_reference=$2 AND payment_status='paid'",[record.id,sessionId]);
    if (!existing.length) return res.status(409).json({received:false,error:"Payment could not be reconciled to this request."});
  }

  if (!isConnection && updated.length) {
    await db.query(
      "INSERT INTO payment_audit_log (application_id,action,payment_method,payment_reference,amount_cents,recorded_by,details) VALUES ($1,'provider_confirmed','stripe',$2,$3,'stripe-webhook',$4)",
      [record.id,sessionId,amount,"Verified Stripe " + event.type + " event " + clean(event.id,120)]
    );
  }
  return res.json({received:true,updated:updated.length===1});
}