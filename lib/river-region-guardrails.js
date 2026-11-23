export const RIVER_REGION_FIPS = Object.freeze(["01001","01051","01085","01101"]);
export const COUNTY_BY_FIPS = Object.freeze({
  "01001":"Autauga","01051":"Elmore","01085":"Lowndes","01101":"Montgomery"
});
export function normalizeFips(value) {
  const fips = String(value ?? "").trim().padStart(5,"0");
  return /^\d{5}$/.test(fips) ? fips : "";
}
export function isRiverRegionFips(value) {
  return RIVER_REGION_FIPS.includes(normalizeFips(value));
}
export function evaluateRiverRegion(candidate) {
  const state = String(candidate?.state ?? "").trim().toUpperCase();
  const fips = normalizeFips(candidate?.county_fips);
  const displayRights = candidate?.display_rights === true;
  const ownerAuthorized = candidate?.owner_authorized === true;
  const countyVerified = candidate?.county_verified === true && isRiverRegionFips(fips);
  const reasons = [];
  if (state !== "AL") reasons.push("state_not_AL");
  if (!countyVerified) reasons.push("county_not_verified_in_four_counties");
  if (!displayRights) reasons.push("display_rights_not_verified");
  if (!ownerAuthorized) reasons.push("owner_authorization_not_verified");
  return { eligible: reasons.length === 0, county_fips: countyVerified ? fips : null,
    county: countyVerified ? COUNTY_BY_FIPS[fips] : null, display_rights_verified: displayRights,
    owner_authorized_verified: ownerAuthorized, reasons };
}
export async function geocodeRiverCounty(address, fetchImpl = fetch) {
  const normalized = String(address ?? "").replace(/\s+/g," ").trim();
  if (normalized.length < 8 || !/^\d{1,6}\s+\S+/.test(normalized)) return { verified:false, county:null, county_fips:null, reason:"full_street_address_required" };
  const url = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=" +
    encodeURIComponent(normalized) + "&benchmark=Public_AR_Current&format=json";
  try {
    const response = await fetchImpl(url,{timeout_ms:10000,headers:{Accept:"application/json"}});
    if (!response.ok) return { verified:false,county:null,county_fips:null,reason:"census_geocoder_http_"+response.status };
    const payload = await response.json();
    const match = payload?.result?.addressMatches?.[0];
    const county = match?.geographies?.Counties?.[0];
    const fips = normalizeFips(county?.GEOID || (String(county?.STATE||"")+String(county?.COUNTY||"")));
    if (!match || !isRiverRegionFips(fips)) return { verified:false,county:null,county_fips:null,reason:"address_not_resolved_to_allowed_county" };
    return { verified:true,county:COUNTY_BY_FIPS[fips],county_fips:fips,matched_address:match.matchedAddress||normalized };
  } catch (error) {
    return { verified:false,county:null,county_fips:null,reason:"geocoder_error:"+String(error?.message||error).slice(0,160) };
  }
}