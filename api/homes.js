import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  const { rows } = await db.query(
    "SELECT id,slug,title,address,city,state,zip,rent_cents,deposit_cents,bedrooms,bathrooms,sqft,property_type,description,image_url,features,pets_allowed,available_from,is_available,featured FROM homes WHERE is_available = TRUE AND listing_status = 'available' AND owner_authorized = TRUE ORDER BY featured DESC, created_at DESC"
  );
  return res.json(rows);
}