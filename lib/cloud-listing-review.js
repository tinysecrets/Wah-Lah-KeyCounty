import { config } from "hatchable";

const clean = (value, max = 500) => String(value ?? "").replace(/[\r\n\u0000-\u001f]/g, " ").trim().slice(0, max);

export async function reviewListingCopy(listing) {
  let key = "";
  try { key = String(await config.get("OPENROUTER_API_KEY") || "").trim(); } catch (_) {}
  if (!key) return { configured: false, model: "openrouter/free", flags: ["cloud_peer_review_not_configured"] };

  const text = [
    "Review this property-listing copy for content quality and potential Fair Housing red flags.",
    "This is a listing-copy quality screen only, not legal advice or a legal compliance determination.",
    "Do not infer or evaluate applicants, buyers, tenants, owners, or protected-class status.",
    "Flag language that expresses preference, limitation, exclusion, or discouragement based on protected characteristics; do not flag neutral property facts or accessibility features.",
    "Also flag unsupported claims, missing material details, manipulative urgency, or misleading availability claims.",
    "Return ONLY JSON: { \"quality\": \"clear\"|\"review\", \"flags\": [short snake_case strings], \"summary\": \"one short sentence\" }.",
    "When uncertain, choose review. Never decide publication or owner authorization.",
    "Listing type: " + clean(listing.listing_type, 30),
    "Property type: " + clean(listing.property_type, 80),
    "Title: " + clean(listing.title, 180),
    "City/State: " + clean([listing.city, listing.state].filter(Boolean).join(", "), 120),
    "Description: " + clean(listing.description, 1000)
  ].join("\n");

  let response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      timeout_ms: 12000,
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://wah-lah-keycounty.hatchable.site",
        "X-Title": "Wah-Lah KeyCounty Listing Review"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a cautious property-listing copy reviewer. You do not make housing eligibility decisions and cannot approve listings." },
          { role: "user", content: text }
        ]
      })
    });
  } catch (_) {
    return { configured: true, model: "openrouter/free", flags: ["cloud_peer_review_request_failed"] };
  }

  if (!response.ok) {
    return { configured: true, model: "openrouter/free", flags: ["cloud_peer_review_http_" + response.status] };
  }

  let payload = {};
  try { payload = await response.json(); } catch (_) {}
  const content = payload?.choices?.[0]?.message?.content;
  let parsed;
  try {
    const raw = String(content || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(raw);
  } catch (_) {
    return { configured: true, model: "openrouter/free", flags: ["cloud_peer_review_invalid_response"] };
  }

  const flags = Array.isArray(parsed.flags) ? parsed.flags.map(v => clean(v, 80)).filter(Boolean).slice(0, 8) : [];
  if (String(parsed.quality || "").toLowerCase() !== "clear" && !flags.length) flags.push("cloud_peer_review_requests_manual_review");
  return {
    configured: true,
    model: "openrouter/free",
    flags,
    summary: clean(parsed.summary, 240),
    quality: String(parsed.quality || "review").toLowerCase() === "clear" && !flags.length ? "clear" : "review"
  };
}