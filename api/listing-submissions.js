import { db } from "hatchable";
export const access = "public";
export const methods = ["POST"];
const clean=(v,n=500)=>String(v??"").trim().slice(0,n);
export default async function(req,res){
 const b=req.body||{}, photos=Array.isArray(b.photos)?b.photos:[];
 const name=clean(b.ownerName,120),email=clean(b.ownerEmail,180),title=clean(b.title,180),city=clean(b.city,100)||"Montgomery",rent=Number(b.monthlyRent),beds=Number(b.bedrooms),baths=Number(b.bathrooms),sqft=Number(b.sqft);
 if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!title||!clean(b.address,250))return res.status(400).json({ok:false,message:"Please complete the required contact and property details."});
 if(photos.length>5||photos.some(p=>typeof p!=="string"||!/^data:image\/(jpeg|png|webp);base64,/.test(p)||p.length>720000))return res.status(413).json({ok:false,message:"Upload up to 5 compressed JPG, PNG, or WebP photos, each under about 500 KB."});
 await db.query("INSERT INTO listing_submissions (owner_name,owner_email,owner_phone,property_title,address,city,state,zip,monthly_rent_cents,bedrooms,bathrooms,sqft,description,photo_data,owner_authorization) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,false)",[name,email,clean(b.ownerPhone,50),title,clean(b.address,250),city,clean(b.state,20)||"AL",clean(b.zip,12),Number.isFinite(rent)&&rent>0?Math.round(rent*100):null,Number.isFinite(beds)&&beds>=0?Math.round(beds):null,Number.isFinite(baths)&&baths>=0?baths:null,Number.isFinite(sqft)&&sqft>=0?Math.round(sqft):null,clean(b.description,2000),JSON.stringify(photos)]);
 return res.status(201).json({ok:true,message:"Your property was sent to Wah-Lah KeyCounty for review. It will not appear publicly until the details and listing authorization are checked."});
}