import { db } from "hatchable";

export const access = "admin";
export const methods = ["GET"];

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = cents => "$" + (Number(cents || 0) / 100).toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2});
const date = v => v ? new Date(v).toLocaleString("en-US", {dateStyle:"medium",timeStyle:"short"}) : "—";

export default async function (req, res) {
  const { rows } = await db.query(
    "SELECT cr.id,cr.reference_code,cr.full_name,cr.email,cr.phone,cr.preferred_contact,cr.message,cr.fee_cents,cr.status,cr.payment_status,cr.payment_method,cr.payment_reference,cr.paid_at,cr.admin_notified_at,cr.fulfillment_status,cr.created_at,h.title,h.address,h.city,h.state,h.listing_type,h.source_name,h.source_url FROM connection_requests cr JOIN homes h ON h.id=cr.home_id ORDER BY CASE WHEN cr.payment_status='paid' AND cr.fulfillment_status='needs_follow_up' THEN 0 WHEN cr.payment_status='paid' THEN 1 ELSE 2 END,cr.created_at DESC LIMIT 250"
  );

  const body = rows.map(r => {
    const paid = r.payment_status === "paid";
    const actions = paid
      ? '<div class="actions"><button data-id="' + r.id + '" data-action="contacted">Mark contacted</button><button data-id="' + r.id + '" data-action="completed">Complete</button><button class="quiet" data-id="' + r.id + '" data-action="unable_to_connect">Unable to connect</button></div>'
      : '<span class="muted">Awaiting confirmed payment</span>';
    const source = r.source_url
      ? '<a href="' + esc(r.source_url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.source_name || "Original listing") + '</a>'
      : esc(r.source_name || "No external source");
    return '<tr><td><strong>' + esc(r.reference_code) + '</strong><br><span class="muted">' + esc(date(r.created_at)) + '</span></td><td><strong>' + esc(r.title) + '</strong><br>' + esc(r.address) + ', ' + esc(r.city) + ', ' + esc(r.state) + '<br><span class="muted">' + esc(r.listing_type === "sale" ? "For sale" : "For rent / lease") + '</span><br>' + source + '</td><td><strong>' + esc(r.full_name) + '</strong><br><a href="mailto:' + encodeURIComponent(r.email) + '">' + esc(r.email) + '</a><br>' + (r.phone ? '<a href="tel:' + encodeURIComponent(r.phone) + '">' + esc(r.phone) + '</a>' : 'No phone provided') + '<br><span class="muted">Preferred: ' + esc(r.preferred_contact) + '</span></td><td>' + esc(r.message || "No message supplied") + '</td><td><strong>' + esc(money(r.fee_cents)) + '</strong><br><span class="status ' + (paid ? 'paid' : 'pending') + '">' + esc(r.payment_status) + '</span><br><span class="muted">' + esc(date(r.paid_at)) + '</span></td><td><strong>' + esc(r.fulfillment_status.replaceAll("_"," ")) + '</strong><br>' + actions + '</td></tr>';
  }).join("");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connection Requests | Wah-Lah KeyCounty</title><link rel="stylesheet" href="/theme.css"><style>
  body{background:#071512;color:#e5f2eb}.wrap{max-width:1500px;margin:auto;padding:24px}.intro{padding:28px 0 12px}.panel{margin:18px 0;padding:18px;border:1px solid #28483e;border-radius:16px;background:#0e211c}.tablewrap{overflow:auto}.table{width:100%;border-collapse:collapse;min-width:1100px}.table th,.table td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #28483e;max-width:360px;overflow-wrap:anywhere}.muted{color:#9fb5aa;font-size:.88rem}.status{display:inline-block;padding:4px 8px;border-radius:99px}.paid{background:#123c30;color:#8df0c3}.pending{background:#40351a;color:#f4d488}.actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.actions button{border:1px solid #356f60;border-radius:8px;padding:7px 9px;background:#176456;color:white;cursor:pointer}.actions .quiet{background:#172a24;color:#dae9e0}.notice{display:none;margin:10px 0;padding:12px;border-radius:8px;background:#17392d}.notice.show{display:block}h1{font:700 clamp(32px,5vw,48px)/1.1 Georgia,serif}.navline{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center}.brand{color:#e7f5ed;text-decoration:none;font-weight:800}.empty{padding:26px}.btnlink{border:1px solid #356f60;padding:9px 12px;border-radius:8px;color:#d8f1e6;text-decoration:none}
  </style></head><body><header class="wrap navline"><a class="brand" href="/">Wah-Lah KeyCounty</a><a class="btnlink" href="/">View public site</a></header><main class="wrap"><section class="intro"><div class="muted">WAH-LAH INDUSTRIES · OPERATOR WORKSPACE</div><h1>Home Connection Requests</h1><p>Paid requests are ranked first. Open the original property source, reach the requester using their preferred contact method, and update the follow-up status below.</p><p class="muted">Browsing is free. The same $35 Home Connection Service applies to requests about homes for sale, rent, or lease. Payment status changes only after verified Paddle confirmation.</p></section><div id="notice" class="notice" role="status"></div><section class="panel"><div class="navline"><h2>Requests</h2><button id="refresh" class="btnlink" type="button">Refresh queue</button></div><div class="tablewrap"><table class="table"><thead><tr><th>Reference</th><th>Property</th><th>Requester</th><th>Request notes</th><th>Payment</th><th>Follow-up</th></tr></thead><tbody>${body || '<tr><td colspan="6" class="empty">No connection requests yet. Paid requests will appear here.</td></tr>'}</tbody></table></div></section></main><script>
  const notice=document.querySelector('#notice');
  async function update(id,action,button){button.disabled=true;try{const r=await fetch('/api/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not update request');notice.textContent='Request '+j.request.reference_code+' updated to '+j.request.fulfillment_status.replaceAll('_',' ')+'.';notice.classList.add('show');setTimeout(()=>location.reload(),650)}catch(e){notice.textContent=e.message;notice.classList.add('show');button.disabled=false}}
  document.querySelectorAll('[data-id][data-action]').forEach(button=>button.addEventListener('click',()=>update(Number(button.dataset.id),button.dataset.action,button)));
  document.querySelector('#refresh').addEventListener('click',()=>location.reload());
</script></body></html>`);
}