import { db } from "hatchable";

export async function queueEmail({ eventKey, to, subject, text, html }) {
  const key = String(eventKey || "").trim().slice(0, 180);
  const recipient = String(to || "").trim().toLowerCase().slice(0, 180);
  const title = String(subject || "").trim().slice(0, 240);
  const textBody = String(text || "").slice(0, 12000);
  const htmlBody = String(html || "").slice(0, 24000);
  if (!key || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !title || !textBody || !htmlBody) {
    throw new Error("A valid notification key, recipient, subject, text, and HTML body are required.");
  }
  const result = await db.query(
    "INSERT INTO customer_notification_outbox (event_key,recipient,subject,text_body,html_body) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_key) DO NOTHING RETURNING id",
    [key, recipient, title, textBody, htmlBody]
  );
  return { queued: result.rows.length === 1, id: result.rows[0]?.id || null };
}

export const escapeEmailHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[c]));