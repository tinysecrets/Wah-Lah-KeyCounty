import { db } from "hatchable";

export const access = "admin";
export const methods = ["GET"];

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = cents => cents == null ? "No limit supplied" : "$" + (Number(cents)/100).toLocaleString("en-US",{maximumFractionDigits:0});
const date = v => v ? new Date(v).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}) : "—";
const typeName = v => v === "all" ? "Rent, lease or sale" : v === "sale" ? "For sale" : "For rent / lease";

export default async function (req, res) {
  const { rows } = await db.query(
    "SELECT id,full_name,email,phone,requested_area,listing_type,max_price_cents,min_bedrooms,message,consent_to_contact,status,admin_notes,contacted_at,created_at FROM area_search_leads ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'contacted' THEN 1 WHEN 'matched' THEN 2 ELSE 3 END,created_at DESC LIMIT 500"
  );
  const body = rows.map(r => {
    const subject = "Your Wah-Lah KeyCounty home search";
    const mailBody = [
      "Hi " + r.full_name + ",",
      "",
      "You asked Wah-Lah KeyCounty to follow up about homes in " + r.requested_area + ".",
      "Your preference: " + typeName(r.listing_type) + ".",
      "We are checking the available options and will share matching listings as they are confirmed.",
      "",
      "Thank you,",
      "Wah-Lah KeyCounty"
    ].join("\n");
    const mail = "mailto:" + encodeURIComponent(r.email).replace(/%40/gi,"@") + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(mailBody);
    const status = r.status || "new";
    return '<tr><td><strong>#' + r.id + ' · ' + esc(r.full_name) + '</strong><br><span class="muted">' + esc(date(r.created_at)) + '</span><br><span class="status s-' + esc(status) + '">' + esc(status.replaceAll("_"," ")) + '</span></td>' +
      '<td><strong>' + esc(r.requested_area) + '</strong><br>' + esc(typeName(r.listing_type)) + '<br>' + esc(r.min_bedrooms == null ? "Any bedrooms" : r.min_bedrooms + "+ bedrooms") + '<br>' + esc(money(r.max_price_cents)) + '</td>' +
      '<td><strong>' + esc(r.email) + '</strong><br><a href="' + esc(mail) + '">Draft follow-up email</a><br>' + (r.phone ? '<a href="tel:' + encodeURIComponent(r.phone) + '">' + esc(r.phone) + '</a>' : 'No phone provided') + '<br><span class="muted">Contact consent: ' + (r.consent_to_contact ? "yes" : "no") + '</span></td>' +
      '<td>' + esc(r.message || "No extra notes") + (r.admin_notes ? '<hr><span class="muted">Operator note: ' + esc(r.admin_notes) + '</span>' : '') + '</td>' +
      '<td><div class="actions"><button data-id="' + r.id + '" data-action="contacted">Mark contacted</button><button data-id="' + r.id + '" data-action="matched">Matched</button><button class="quiet" data-id="' + r.id + '" data-action="closed">Close</button></div></td></tr>';
  }).join("");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Area Search Leads | Wah-Lah KeyCounty</title><link rel="stylesheet" href="/theme.css"><style>
  body{background:#071512;color:#e5f2eb}.wrap{max-width:1450px;margin:auto;padding:24px}.navline{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center}.brand{color:#e7f5ed;text-decoration:none;font-weight:800}.panel{margin:18px 0;padding:20px;border:1px solid #28483e;border-radius:16px;background:#0e211c}.tablewrap{overflow:auto}.table{width:100%;border-collapse:collapse;min-width:1000px}.table th,.table td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #28483e;max-width:350px;overflow-wrap:anywhere}.muted{color:#9fb5aa;font-size:.88rem}.status{display:inline-block;padding:4px 8px;border-radius:99px;background:#26362e;color:#d6e6dc;font-size:.8rem}.s-new{background:#40351a;color:#f4d488}.s-contacted{background:#173d4c;color:#a5e3ff}.s-matched{background:#123c30;color:#8df0c3}.actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.actions button{border:1px solid #356f60;border-radius:8px;padding:7px 9px;background:#176456;color:white;cursor:pointer}.actions .quiet{background:#172a24;color:#dae9e0}.notice{display:none;margin:10px 0;padding:12px;border-radius:8px;background:#17392d}.notice.show{display:block}h1{font:700 clamp(32px,5vw,48px)/1.1 Georgia,serif}a{color:#87dbc9}
  </style></head><body><header class="wrap navline"><a class="brand" href="/">Wah-Lah KeyCounty</a><a class="btn secondary" href="/admin">Control Center</a><a class="btn secondary" href="/">View public site</a></header><main class="wrap"><div class="muted">WAH-LAH INDUSTRIES · CUSTOMER FOLLOW-UP</div><h1>Area Search Requests</h1><p class="muted">These visitors asked KeyCounty to help find housing and consented to follow-up. Use the email draft or phone link, then update each request. No message is sent automatically.</p><div id="notice" class="notice" role="status"></div><section class="panel"><h2>Customer queue</h2><div class="tablewrap"><table class="table"><thead><tr><th>Customer / received</th><th>Area and preferences</th><th>Contact</th><th>Notes</th><th>Follow-up</th></tr></thead><tbody>${body || '<tr><td colspan="5">No area requests have been submitted yet.</td></tr>'}</tbody></table></div></section></main><script>
  const notice=document.querySelector('#notice');
  document.querySelectorAll('[data-id][data-action]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;const note=prompt('Optional internal follow-up note (leave blank to keep the current note):')||'';try{const r=await fetch('/api/area-leads-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(button.dataset.id),action:button.dataset.action,note})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not update request');notice.textContent='Customer request #'+j.lead.id+' updated to '+j.lead.status+'.';notice.classList.add('show');setTimeout(()=>location.reload(),500)}catch(e){notice.textContent=e.message;notice.classList.add('show');button.disabled=false}}));
  </script></body></html>`);
}