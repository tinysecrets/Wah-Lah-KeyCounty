import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];
export default async function (req,res) {
 const { rows } = await db.query("SELECT business_name,contact_email,contact_phone,application_fee_cents,application_mode FROM settings WHERE id = 1");
 res.json(rows[0] || {business_name:"Nationwide Home Rentals",application_fee_cents:3500,application_mode:"simplified"});
}