import { config } from "hatchable";

export const access = "public";
export const methods = ["GET"];

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const get = async key => { try { return String(await config.get(key) ?? "").trim(); } catch (_) { return ""; } };

export default async function (req, res) {
  const names = [
    "PADDLE_ENVIRONMENT","PADDLE_CLIENT_TOKEN",
    "PADDLE_PRICE_STARTER_MONTH","PADDLE_PRICE_STARTER_YEAR",
    "PADDLE_PRICE_PRO_MONTH","PADDLE_PRICE_PRO_YEAR",
    "PADDLE_PRICE_ADVANCED_MONTH","PADDLE_PRICE_ADVANCED_YEAR"
  ];
  const values = await Promise.all(names.map(get));
  const cfg = Object.fromEntries(names.map((name,i) => [name, values[i]]));
  const headers = req.headers || {};
  const country = String(headers["x-vercel-ip-country"] || headers["cf-ipcountry"] || headers["x-country-code"] || "").trim().toUpperCase();
  const email = String(req.user?.email || req.member?.email || "").trim();
  const configured = cfg.PADDLE_ENVIRONMENT === "live" &&
    /^live_[A-Za-z0-9_-]+$/.test(cfg.PADDLE_CLIENT_TOKEN) &&
    names.slice(2).every(n => /^pri_[a-z0-9]+$/i.test(cfg[n]));
  if (cfg.PADDLE_ENVIRONMENT && cfg.PADDLE_ENVIRONMENT !== "live") {
    res.status(503);
  }
  res.setHeader("Content-Type","text/html; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  return res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#071816"><title>Plans & Pricing | Wah-Lah KeyCounty</title><meta name="description" content="Choose a Wah-Lah KeyCounty plan. Compare Starter, Pro, and Advanced with localized Paddle pricing."><link rel="stylesheet" href="/theme.css"><script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script><style>
  .pricing-hero{padding:58px 0 34px;background:radial-gradient(ellipse at 88% 10%,#1d5a50 0,transparent 42%),linear-gradient(135deg,#0b211f,#102522)}.pricing-hero h1{font:700 clamp(38px,6vw,68px)/1.05 'Playfair Display',Georgia,serif;letter-spacing:-.04em;max-width:780px;margin:12px 0}.pricing-hero p{max-width:680px;color:#c9ded5;line-height:1.8}.billing-toggle{display:flex;align-items:center;justify-content:center;gap:10px;margin:28px auto 8px}.billing-toggle button{border:1px solid var(--wl-line);border-radius:999px;padding:10px 17px;background:#102522;color:var(--wl-ink);font-weight:800;cursor:pointer}.billing-toggle button[aria-pressed=true]{background:var(--wl-teal);color:#06211c;border-color:var(--wl-teal)}.pricing-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:stretch;margin:25px 0}.plan{position:relative;padding:26px;border:1px solid var(--wl-line);border-radius:22px;background:linear-gradient(145deg,#122a26,#0c1f1c);display:flex;flex-direction:column;min-width:0}.plan.featured{border-color:var(--wl-teal);box-shadow:0 0 0 1px #40d3bd25,0 22px 55px #0003}.plan-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.16em;color:var(--wl-gold);font-weight:850}.plan h2{font:700 29px/1.2 'Playfair Display',Georgia,serif;margin:10px 0}.plan-desc{color:var(--wl-muted);min-height:52px}.plan-price{font-size:clamp(30px,3.4vw,42px);font-weight:850;letter-spacing:-.04em;margin:23px 0 2px;color:#f0f6f1;overflow-wrap:anywhere}.plan-cycle{font-size:13px;color:var(--wl-muted);min-height:22px}.plan ul{padding:0;margin:23px 0;list-style:none;display:grid;gap:12px;flex:1}.plan li{display:flex;gap:9px;color:#d8e6df;font-size:14px;line-height:1.5}.plan li:before{content:'✓';color:var(--wl-teal);font-weight:900}.plan .btn{width:100%;margin-top:12px}.price-status{font-size:12px;color:var(--wl-muted);min-height:18px;margin-top:10px}.fineprint{font-size:12px;color:var(--wl-muted);line-height:1.7;max-width:850px;margin:26px auto}.config-warning{margin:18px auto;max-width:900px}.plan button:disabled{opacity:.55;cursor:not-allowed;transform:none}.country-note{text-align:center;color:var(--wl-muted);font-size:12px}.billing-savings{color:var(--wl-gold);font-size:12px;font-weight:800;margin-top:3px}.pricing-nav{padding:17px 0}.pricing-nav .wrap{display:flex;justify-content:space-between;align-items:center;gap:12px}.pricing-nav a{text-decoration:none}@media(max-width:760px){.pricing-grid{grid-template-columns:1fr;max-width:520px;margin:20px auto}.plan{padding:22px}.plan-desc{min-height:0}.pricing-hero{padding:38px 0 22px}.billing-toggle{margin-top:22px}.plan-price{font-size:38px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
  </style></head><body><header class="nav pricing-nav"><div class="wrap"><a class="brand" href="/"><span>Wah-Lah</span> KeyCounty</a><a href="/">Back to homes</a></div></header><main><section class="pricing-hero"><div class="wrap"><div class="eyebrow">Wah-Lah Industries · Plans</div><h1>A plan that moves you forward.</h1><p>Choose the level of KeyCounty tools that fits your needs. Paddle calculates the price for your location and billing period, including applicable taxes where configured. The final total shown here is returned by Paddle.</p></div></section><section class="section"><div class="wrap"><div class="billing-toggle" role="group" aria-label="Billing frequency"><button id="bill-month" type="button" aria-pressed="true">Monthly</button><button id="bill-year" type="button" aria-pressed="false">Yearly</button></div><p id="billing-note" class="country-note">Prices are being loaded from Paddle…</p><div id="setup-warning" class="notice config-warning ${configured ? "hidden" : ""}" role="status">${configured ? "" : "Live pricing is not connected yet. Add the live Paddle client token and six live price IDs in Hatchable Setup before customers can subscribe. Checkout is intentionally disabled until the live configuration is complete."}</div><div class="pricing-grid">
  <article class="plan"><div class="plan-kicker">A strong start</div><h2>Starter</h2><p class="plan-desc">Essential tools for getting organized and making your next move.</p><div class="plan-price" id="price-starter">—</div><div class="plan-cycle" id="cycle-starter">Price loading</div><ul><li>Core KeyCounty tools</li><li>Essential listing discovery</li><li>Standard account support</li></ul><button class="btn secondary subscribe" data-tier="starter" type="button" disabled>Subscribe to Starter</button><div class="price-status" id="status-starter" aria-live="polite"></div></article>
  <article class="plan featured"><div class="plan-kicker">Most capable</div><h2>Pro</h2><p class="plan-desc">More tools and flexibility for active housing searches and property workflows.</p><div class="plan-price" id="price-pro">—</div><div class="plan-cycle" id="cycle-pro">Price loading</div><ul><li>Everything in Starter</li><li>Expanded search and workflow tools</li><li>Priority request tracking</li><li>Enhanced account features</li></ul><button class="btn primary subscribe" data-tier="pro" type="button" disabled>Subscribe to Pro</button><div class="price-status" id="status-pro" aria-live="polite"></div></article>
  <article class="plan"><div class="plan-kicker">Full access</div><h2>Advanced</h2><p class="plan-desc">A comprehensive toolkit for high-volume, multi-step property workflows.</p><div class="plan-price" id="price-advanced">—</div><div class="plan-cycle" id="cycle-advanced">Price loading</div><ul><li>Everything in Pro</li><li>Advanced workflow capacity</li><li>Deeper tracking and organization</li><li>Expanded support options</li></ul><button class="btn secondary subscribe" data-tier="advanced" type="button" disabled>Subscribe to Advanced</button><div class="price-status" id="status-advanced" aria-live="polite"></div></article>
</div><p class="fineprint">Your selected plan and billing frequency are shown in Paddle Checkout before you confirm. Subscription terms, taxes, and available payment methods are determined by your Paddle account configuration. No payment is taken by this page itself.</p></div></section></main><footer class="footer"><div class="wrap"><strong>Wah-Lah KeyCounty</strong> · <a href="/policy/">Policies</a> · <a href="/">Home</a></div></footer>
<script>
(function(){
 const config = ${JSON.stringify({environment:cfg.PADDLE_ENVIRONMENT||"",token:cfg.PADDLE_CLIENT_TOKEN||"",prices:{starter:{month:cfg.PADDLE_PRICE_STARTER_MONTH||"",year:cfg.PADDLE_PRICE_STARTER_YEAR||""},pro:{month:cfg.PADDLE_PRICE_PRO_MONTH||"",year:cfg.PADDLE_PRICE_PRO_YEAR||""},advanced:{month:cfg.PADDLE_PRICE_ADVANCED_MONTH||"",year:cfg.PADDLE_PRICE_ADVANCED_YEAR||""}},country:country||null,email:email||""}).replace(/</g,"\\u003c")};
 const ready = ${configured ? "true" : "false"};
 const names = {starter:"Starter",pro:"Pro",advanced:"Advanced"};
 let billing = "month", paddleReady = false, prices = {};
 const note = document.getElementById("billing-note");
 const warning = document.getElementById("setup-warning");
 function setText(id,value){document.getElementById(id).textContent=value;}
 function enableButtons(){document.querySelectorAll(".subscribe").forEach(b=>b.disabled=!(paddleReady&&prices[b.dataset.tier]&&prices[b.dataset.tier].formattedTotals));}
 function totalFromPreview(result){
   const data=result&&result.data;
   const items=data&&data.details&&data.details.lineItems;
   const line=Array.isArray(items)?items[0]:null;
   const totals=line&&line.formattedTotals;
   return totals&&(totals.total||totals.subtotal||totals.grandTotal||totals.totalAmount)?totals:null;
 }
 async function previewTier(tier){
   const priceId=config.prices[tier][billing];
   if(!priceId){setText("price-"+tier,"Not configured");setText("cycle-"+tier,"Live Paddle price ID required");return;}
   try{
     const opts={items:[{priceId:priceId,quantity:1}]};
     if(config.country) opts.address={countryCode:config.country};
     const result=await window.Paddle.PricePreview(opts);
     const totals=totalFromPreview(result);
     if(!totals) throw new Error("Paddle did not return formatted totals for "+names[tier]+".");
     prices[tier]={priceId:priceId,formattedTotals:totals};
     setText("price-"+tier,totals.total || totals.subtotal || totals.grandTotal || totals.totalAmount);
     setText("cycle-"+tier,billing==="month"?"per month":"per year");
     setText("status-"+tier,"");
   }catch(err){prices[tier]=null;setText("price-"+tier,"Unavailable");setText("cycle-"+tier,"Price preview failed");setText("status-"+tier,err.message||"Could not load price from Paddle.");}
 }
 async function refresh(){
   prices={};enableButtons();
   await Promise.all(["starter","pro","advanced"].map(previewTier));
   enableButtons();
 }
 document.getElementById("bill-month").addEventListener("click",()=>{billing="month";document.getElementById("bill-month").setAttribute("aria-pressed","true");document.getElementById("bill-year").setAttribute("aria-pressed","false");refresh();});
 document.getElementById("bill-year").addEventListener("click",()=>{billing="year";document.getElementById("bill-month").setAttribute("aria-pressed","false");document.getElementById("bill-year").setAttribute("aria-pressed","true");refresh();});
 document.querySelectorAll(".subscribe").forEach(button=>button.addEventListener("click",()=>{
   const tier=button.dataset.tier, price=prices[tier];
   if(!paddleReady||!price||!price.formattedTotals)return;
   const settings={displayMode:"overlay",variant:"one-page",successUrl:window.location.origin+"/welcome"};
   const customer=config.email?{email:config.email}:undefined;
   window.Paddle.Checkout.open({items:[{priceId:price.priceId,quantity:1}],settings:settings,customer:customer});
 }));
 if(!ready){note.textContent="Paddle live configuration is missing. No sandbox or test environment will be used.";return;}
 if(config.environment!=="live"||!/^live_[A-Za-z0-9_-]+$/.test(config.token)){note.textContent="Configuration error: PADDLE_ENVIRONMENT must be live and the client token must begin with live_. Checkout remains disabled.";return;}
 if(!window.Paddle){note.textContent="Paddle.js did not load. Check script access and try again.";return;}
 try{
   window.Paddle.Environment.set("production");
   window.Paddle.Initialize({token:config.token});
   paddleReady=true;
   note.textContent=config.country?"Localized by Paddle for country "+config.country+".":"Paddle will detect your location from your IP address.";
   if(!config.country) note.textContent+=" Prices are supplied by Paddle, not calculated in the browser.";
   refresh();
 }catch(err){note.textContent="Paddle initialization failed: "+(err.message||"check the live client token.");}
})();
</script></body></html>`);
}