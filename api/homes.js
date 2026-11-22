import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  const { rows } = await db.query(
    "SELECT id,slug,title,address,city,state,zip,county,county_fips,rent_cents,deposit_cents,sale_price_cents,listing_type,bedrooms,bathrooms,sqft,property_type,description,image_url,image_urls,features,pets_allowed,available_from,is_available,featured,source_url,source_name,external_listing,status_updated_at FROM homes WHERE is_available=TRUE AND listing_status='available' AND UPPER(state)='AL' AND county_fips IN ('01001','01051','01085','01101') AND display_rights=TRUE AND owner_authorized=TRUE ORDER BY featured DESC,created_at DESC"
  );
  return res.json(rows);
}