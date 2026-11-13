import { db, config } from "hatchable";

export const access = "public";
export const methods = ["POST"];

const clean = (v, max = 180) => String(v ?? "").trim().slice(0, max);

export default async function (req, res) {
  const referenceCode = clean(req.body?.referenceCode, 80);
  const email = clean(req.body?.email, 180).toLowerCase();
  if (!/^(KC|RA)-[A-Z0-9-]{8,80}$/.test(referenceCode) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, message: "A valid request reference and email are required." });
  }

  let apiKey;
  try { apiKey = await config.get("PADDLE_API_KEY"); } catch (_) {}
  if (!apiKey) return res.status(503).json({ ok: false, message: "Paddle checkout is not activated yet. The business must be approved and Paddle credentials added in the project Setup page before payments can be accepted." });

  const isConnection = referenceCode.startsWith("KC-");
  const query = isConnection
    ? "SELECT reference_code,fee_cents,email,payment_status FROM connection_requests WHERE reference_code=$1"
    : "SELECT reference_code,fee_cents,email,payment_status FROM applications WHERE reference_code=$1";
  const { rows } = await db.query(query, [referenceCode]);
  const record = rows[0];
  if (!record || String(record.email).toLowerCase() !== email) return res.status(404).json({ ok: false, message: "We could not verify that reference and email combination." });
  if (["paid", "captured", "manual_received"].includes(record.payment_status)) return res.status(409).json({ ok: false, message: "This request is already marked paid. Contact KeyCounty if you need help." });
  const amount = Number(record.fee_cents);
  if (!Number.isSafeInteger(amount) || amount <= 0) return res.status(409).json({ ok: false, message: "No payment is currently due for this request." });

  const payload = {
    items: [{
      quantity: 1,
      price: {
        description: "One-time KeyCounty housing connection service",
        name: "KeyCounty Home Connection Service",
        billing_cycle: null,
        unit_price: { amount: String(amount), currency_code: "USD" },
        product: {
          name: "KeyCounty Home Connection Service",
          description: "One-time service fee for a housing connection request.",
          tax_category: "standard"
        }
      }
    }],
    custom_data: { reference_code: record.reference_code, service_type: isConnection ? "home_connection" : "rental_application" },
    collection_mode: "automatic"
  };

  let upstream;
  try {
    upstream = await fetch("https://api.paddle.com/transactions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Paddle-Version": "1", "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    return res.status(502).json({ ok: false, message: "Paddle could not be reached. No payment was taken; please try again later." });
  }
  const data = await upstream.json().catch(() => ({}));
  const checkoutUrl = data?.data?.checkout?.url;
  const transactionId = data?.data?.id;
  if (!upstream.ok || !checkoutUrl || !/^https:\/\//i.test(checkoutUrl) || !/^txn_[a-z0-9]+$/i.test(transactionId || "")) {
    console.error("Paddle transaction creation failed", { status: upstream.status, code: data?.error?.code || data?.error?.type || "unknown" });
    return res.status(502).json({ ok: false, message: "Paddle could not create a checkout. Confirm the Paddle account, product eligibility, and checkout configuration in Paddle." });
  }
  return res.status(200).json({ ok: true, checkoutUrl, transactionId, referenceCode, feeCents: amount });
}