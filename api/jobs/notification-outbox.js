import { db, config } from "hatchable";

export const access = "scheduler";
export const methods = ["POST"];

const clean = value => String(value?.message || value || "Unknown email error")
  .replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 500);

export default async function (req, res) {
  let apiKey = "";
  try { apiKey = String(await config.get("RESEND_API_KEY") || "").trim(); } catch (_) {}
  if (!apiKey) {
    return res.status(503).json({ ok: false, error: "RESEND_API_KEY is not configured; queued messages remain safely pending." });
  }

  const claimed = await db.query(`
    WITH picked AS (
      SELECT id
      FROM customer_notification_outbox
      WHERE (status='pending' AND next_attempt_at <= now())
         OR (status='sending' AND updated_at < now() - interval '10 minutes')
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 10
    )
    UPDATE customer_notification_outbox AS q
    SET status='sending', attempts=q.attempts+1, updated_at=now()
    FROM picked
    WHERE q.id=picked.id
    RETURNING q.id,q.recipient,q.subject,q.text_body,q.html_body,q.attempts
  `);

  let sent = 0, retrying = 0, failed = 0;
  for (const item of claimed.rows) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        timeout_ms: 10000,
        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Wah-Lah KeyCounty <admin@wah-lah.com>",
          to: [item.recipient],
          reply_to: "support@wah-lah.com",
          subject: item.subject,
          text: item.text_body,
          html: item.html_body
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.id) {
        throw new Error("Resend HTTP " + response.status + ": " + clean(payload.message || payload.error || "Message was not accepted."));
      }
      await db.query(
        "UPDATE customer_notification_outbox SET status='sent',provider_message_id=$1,last_error=NULL,sent_at=now(),updated_at=now() WHERE id=$2",
        [String(payload.id).slice(0, 240), item.id]
      );
      sent++;
    } catch (error) {
      const message = clean(error);
      const terminal = Number(item.attempts) >= 6;
      await db.query(
        "UPDATE customer_notification_outbox SET status=$1,next_attempt_at=now() + ($2 * interval '5 minutes'),last_error=$3,updated_at=now() WHERE id=$4",
        [terminal ? "failed" : "pending", Math.min(Number(item.attempts), 60), message, item.id]
      );
      if (terminal) failed++; else retrying++;
    }
  }

  return res.json({ ok: true, claimed: claimed.rows.length, sent, retrying, failed });
}