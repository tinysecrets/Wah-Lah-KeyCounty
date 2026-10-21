import { db } from "hatchable";
export const access = "admin";
export const methods = ["GET","POST"];
const clean=(v,n=500)=>String(v??"").trim().slice(0,n);
export default async function(req,res){
 if(req.method==="GET"){const {rows}=await db.query("SELECT id,owner_name,owner_email,owner_phone,property_title,address,city,state,zip,monthly_rent_cents,bedrooms,bathrooms,sqft,description,photo_data,status,owner_authorization,created_at FROM listing_submissions ORDER BY created_at DESC LIMIT 200");return res.json({submissions:rows});}
 const id=Number(req.body?.id),status=clean(req.body?.status,30);if(!Number.isInteger(id)||id<1||!['pending_review','contacted','approved','rejected'].includes(status))return res.status(400).json({ok:false,message:"Invalid submission update."});
 await db.query("UPDATE listing_submissions SET status=$1,updated_at=now() WHERE id=$2",[status,id]);return res.json({ok:true});
}