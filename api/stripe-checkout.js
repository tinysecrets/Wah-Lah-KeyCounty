import { db, config } from "hatchable";

export const access = "public";
export const methods = ["POST"];

const clean = (v, max = 180) => String(v ?? "").trim().slice(0, max);
const BASE = "https://wah-lah-keycounty.hatchable.site";

export default async function (req, res) {
  const referenceCode = clean(req.body?.referenceCode, 90);
  const email = clean(req.body?.email, 180).toLowerCase();
  if (!/^(KC|RA)-[A-Z0-9-]{8,80}$/.test(referenceCode) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok:false, message:"A valid request reference and email are required." });
  }

  let secret = "", webhookSecret = "", accountConfirmed = "", expectedAccountId = "";
  try { secret = String(await config.get("STRIPE_SECRET_KEY") || "").trim(); } catch (_) {}
  try { webhookSecret = String(await config.get("STRIPE_WEBHOOK_SECRET") || "").trim(); } catch (_) {}
  try { accountConfirmed = String(await config.get("STRIPE_KEYCOUNTY_ACCOUNT_CONFIRMED") || "").trim().toLowerCase(); } catch (_) {}
  try { expectedAccountId = String(await config.get("STRIPE_ACCOUNT_ID") || "").trim(); } catch (_) {}
  if (!/^sk_live_[A-Za-z0-9]+$/.test(secret) || !webhookSecret || !/^acct_[A-Za-z0-9]+$/.test(expectedAccountId) || accountConfirmed !== "yes") {
    return res.status(503).json({
      ok:false,
      code:"stripe_setup_required",
      message:"Your request is saved, but live checkout is locked until the KeyCounty merchant account, payout bank, live API key, and webhook are confirmed. Do not submit a second request."
    });
  }

  // Verify that the server key belongs to the exact live Stripe account audited for KeyCounty.
  let accountCheck;
  try {
    const checkResponse = await fetch("https://api.stripe.com/v1/account", {headers:{"Authorization":"Bearer " + secret}});
    accountCheck = await checkResponse.json().catch(() => ({}));
    if (!checkResponse.ok || accountCheck.id !== expectedAccountId) {
      return res.status(503).json({ok:false,code:"stripe_account_mismatch",message:"The configured Stripe key does not resolve to the approved KeyCounty merchant account. Checkout is locked; no payment was taken."});
    }
    const profileText = String(accountCheck.business_profile?.product_description || "");
    if (!/keycounty/i.test(profileText) || !/(housing|home|property|real estate)/i.test(profileText)) {
      return res.status(503).json({ok:false,code:"stripe_profile_mismatch",message:"The Stripe merchant profile still does not identify KeyCounty housing services. Update the merchant profile before accepting payments."});
    }
  } catch (_) {
    return res.status(503).json({ok:false,code:"stripe_account_check_failed",message:"The live Stripe merchant account could not be verified. Checkout is locked; no payment was taken."});
  }

  const isConnection = referenceCode.startsWith("KC-");
  const table = isConnection ? "connection_requests" : "applications";
  const query = isConnection
    ? "SELECT id,reference_code,home_id,fee_cents,email,payment_status,payment_method,payment_reference,stripe_session_id FROM connection_requests WHERE reference_code=$1"
    : "SELECT id,reference_code,home_id,fee_cents,email,payment_status,payment_method,payment_reference FROM applications WHERE reference_code=$1";
  const { rows } = await db.query(query, [referenceCode]);
  const record = rows[0];
  if (!record || String(record.email).toLowerCase() !== email) {
    return res.status(404).json({ ok:false, message:"We could not verify that request reference and email combination." });
  }
  if (["paid","captured","manual_received"].includes(record.payment_status)) {
    return res.status(409).json({ ok:false, message:"This request is already marked paid. Do not pay again." });
  }
  const amount = Number(record.fee_cents);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return res.status(409).json({ ok:false, message:"No payment is currently due for this request." });
  }

  const existingSessionId = record.payment_method === "stripe" ? clean(record.stripe_session_id || record.payment_reference, 100) : "";
  let idempotencyKey = "keycounty-" + referenceCode + "-initial";
  if (existingSessionId && /^cs_live_[A-Za-z0-9]+$/.test(existingSessionId)) {
    let existing;
    try {
      const response = await fetch("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(existingSessionId), {headers:{"Authorization":"Bearer " + secret}});
      existing = await response.json().catch(() => ({}));
      if (!response.ok) return res.status(502).json({ok:false,message:"The previous Stripe checkout could not be verified. No new payment session was created."});
    } catch (_) {
      return res.status(502).json({ok:false,message:"Stripe could not verify the previous checkout. No new payment session was created."});
    }
    if (existing.status === "open" && existing.url) {
      return res.json({ok:true,checkoutUrl:existing.url,sessionId:existing.id,referenceCode,feeCents:amount,processor:"stripe",reused:true});
    }
    if (existing.status === "complete") {
      return res.status(202).json({ok:false,code:"payment_confirmation_pending",message:"Stripe has completed this checkout session. Payment confirmation is syncing; do not pay again. Refresh the request status shortly."});
    }
    if (existing.status !== "expired") {
      return res.status(409).json({ok:false,message:"The previous checkout is not available for another payment attempt. Contact KeyCounty before retrying."});
    }
    idempotencyKey = "keycounty-" + referenceCode + "-" + existingSessionId;
  }

  const homeResult = await db.query("SELECT title FROM homes WHERE id=$1 LIMIT 1", [record.home_id]);
  const homeTitle = clean(homeResult.rows[0]?.title || "selected home", 180);
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", BASE + "/payment-return/?session_id={CHECKOUT_SESSION_ID}");
  params.set("cancel_url", BASE + "/listing/?id=" + encodeURIComponent(record.home_id) + "&ref=" + encodeURIComponent(referenceCode) + "&checkout=cancelled");
  params.set("client_reference_id", referenceCode);
  params.set("customer_email", email);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(amount));
  params.set("line_items[0][price_data][product_data][name]", "KeyCounty Home Connection Service");
  params.set("line_items[0][price_data][product_data][description]", "One-time service fee for a request about " + homeTitle + ". This is not rent, a security deposit, or a property purchase payment.");
  params.set("metadata[reference_code]", referenceCode);
  params.set("metadata[service_type]", isConnection ? "home_connection" : "rental_application");
  params.set("metadata[home_id]", String(record.home_id));
  params.set("payment_intent_data[description]", "Wah-Lah KeyCounty home connection service — " + referenceCode);

  let upstream;
  try {
    upstream = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method:"POST",
      headers:{
        "Authorization":"Bearer " + secret,
        "Content-Type":"application/x-www-form-urlencoded",
        "Idempotency-Key":idempotencyKey
      },
      body:params.toString()
    });
  } catch (e) {
    console.error("Stripe Checkout request failed", String(e?.message || e).slice(0,240));
    return res.status(502).json({ok:false,message:"Stripe could not be reached. No payment was taken. Retry this same request shortly."});
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !data.id || !data.url || !/^cs_live_/.test(data.id) || !/^https:\/\//i.test(data.url)) {
    console.error("Stripe Checkout creation failed", {status:upstream.status,code:data?.error?.code||"unknown"});
    return res.status(502).json({ok:false,message:"Stripe did not create a live checkout. No payment was taken. Check the live account and key configuration."});
  }

  if (isConnection) {
    await db.query(
      "UPDATE connection_requests SET payment_method='stripe',payment_reference=$1,stripe_session_id=$1,updated_at=now() WHERE id=$2 AND payment_status='unpaid'",
      [data.id, record.id]
    );
  } else {
    await db.query(
      "UPDATE applications SET payment_method='stripe',payment_reference=$1,updated_at=now() WHERE id=$2 AND payment_status='unpaid'",
      [data.id, record.id]
    );
  }
  return res.json({ok:true,checkoutUrl:data.url,sessionId:data.id,referenceCode,feeCents:amount,processor:"stripe"});
}