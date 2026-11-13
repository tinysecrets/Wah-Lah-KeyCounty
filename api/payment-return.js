import { db } from "hatchable";

export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  const sessionId = String(req.query?.session_id || "").trim();
  if (sessionId) {
    if (!/^cs_live_[A-Za-z0-9]+$/.test(sessionId)) return res.status(400).json({ok:false,error:"A valid live Stripe Checkout Session is required."});
    const { rows: stripeRows } = await db.query(
      "SELECT cr.reference_code,cr.payment_status,cr.status,cr.fee_cents,h.title,h.city,h.state,'home_connection' AS service_type FROM connection_requests cr JOIN homes h ON h.id=cr.home_id WHERE cr.payment_reference=$1 OR cr.stripe_session_id=$1 UNION ALL SELECT a.reference_code,a.payment_status,a.status,a.fee_cents,h.title,h.city,h.state,'application' AS service_type FROM applications a JOIN homes h ON h.id=a.home_id WHERE a.payment_reference=$1 LIMIT 1",
      [sessionId]
    );
    if (!stripeRows[0]) return res.status(202).json({ok:true,confirmed:false,paymentStatus:"pending_confirmation",message:"Stripe has not confirmed this payment yet. Refresh shortly; do not pay twice."});
    return res.json({
      ok:true,
      confirmed:["paid","captured"].includes(stripeRows[0].payment_status),
      referenceCode:stripeRows[0].reference_code,
      paymentStatus:stripeRows[0].payment_status,
      requestStatus:stripeRows[0].status,
      serviceType:stripeRows[0].service_type,
      title:stripeRows[0].title,
      city:stripeRows[0].city,
      state:stripeRows[0].state,
      feeCents:stripeRows[0].fee_cents
    });
  }

  const transactionId = String(req.query?.transaction_id || "").trim();
  if (!/^txn_[a-z0-9]+$/i.test(transactionId)) {
    return res.status(400).json({ ok: false, error: "A valid Paddle transaction is required." });
  }

  const { rows } = await db.query(
    "SELECT cr.reference_code,cr.payment_status,cr.status,cr.fee_cents,h.title,h.city,h.state,'home_connection' AS service_type FROM connection_requests cr JOIN homes h ON h.id=cr.home_id WHERE cr.payment_reference=$1 UNION ALL SELECT a.reference_code,a.payment_status,a.status,a.fee_cents,h.title,h.city,h.state,'application' AS service_type FROM applications a JOIN homes h ON h.id=a.home_id WHERE a.payment_reference=$1 LIMIT 1",
    [transactionId]
  );

  if (!rows[0]) {
    return res.status(202).json({
      ok: true,
      confirmed: false,
      paymentStatus: "pending_confirmation",
      message: "Paddle confirmation has not synced yet. Do not pay twice; refresh this page shortly."
    });
  }

  return res.json({
    ok: true,
    confirmed: ["paid", "captured"].includes(rows[0].payment_status),
    referenceCode: rows[0].reference_code,
    paymentStatus: rows[0].payment_status,
    requestStatus: rows[0].status,
    serviceType: rows[0].service_type,
    title: rows[0].title,
    city: rows[0].city,
    state: rows[0].state,
    feeCents: rows[0].fee_cents
  });
}