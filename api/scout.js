import { db } from "hatchable";
export const access = "admin";
export const methods = ["GET", "POST"];
const clean=(v,n=500)=>String(v??"").trim().slice(0,n);
export default async function(req,res){
 if(req.method==="GET"){
  const [leads,summary]=await Promise.all([
   db.query("SELECT id,listing_type,title,address,city,state,price_cents,bedrooms,bathrooms,sqft,source_name,source_url,image_url,source_status,review_status,last_checked_at,notes,created_at,updated_at FROM scout_leads ORDER BY CASE review_status WHEN 'needs_review' THEN 0 WHEN 'verified' THEN 1 WHEN 'authorized' THEN 2 ELSE 3 END, updated_at DESC LIMIT 300"),
   db.query("SELECT count(*)::int total,count(*) FILTER (WHERE review_status='needs_review')::int needs_review,count(*) FILTER (WHERE review_status='authorized')::int authorized,count(*) FILTER (WHERE listing_type='rent')::int rentals,count(*) FILTER (WHERE listing_type='sale')::int sales FROM scout_leads")
  ]);
  return res.json({leads:leads.rows,summary:summary.rows[0],automation:{enabled:false,scope:"Montgomery County, Alabama",reason:"Automated discovery awaits an approved listing feed/API and confirmation of photo/data reuse terms. These leads are not public listings."}});
 }
 const b=req.body||{};
 if(b.action==="add"){
  const type=clean(b.listingType,10),title=clean(b.title,180),url=clean(b.sourceUrl,1000),source=clean(b.sourceName,120);
  if(!['rent','sale'].includes(type)||!title||!/^https:\/\//i.test(url)||!source)return res.status(400).json({ok:false,error:"Provide listing type, title, source name, and an HTTPS source URL."});
  const price=Number(b.priceCents),beds=Number(b.bedrooms),baths=Number(b.bathrooms),sqft=Number(b.sqft);
  const {rows}=await db.query("INSERT INTO scout_leads (listing_type,title,address,city,state,price_cents,bedrooms,bathrooms,sqft,source_name,source_url,image_url,source_status,review_status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'unverified','needs_review',$13) ON CONFLICT (source_url) DO UPDATE SET title=EXCLUDED.title,address=EXCLUDED.address,price_cents=EXCLUDED.price_cents,bedrooms=EXCLUDED.bedrooms,bathrooms=EXCLUDED.bathrooms,sqft=EXCLUDED.sqft,source_name=EXCLUDED.source_name,image_url=EXCLUDED.image_url,source_status='unverified',review_status=CASE WHEN scout_leads.review_status IN ('authorized','published') THEN scout_leads.review_status ELSE 'needs_review' END,updated_at=now() RETURNING id",[type,title,clean(b.address,250),clean(b.city,100)||'Montgomery',clean(b.state,20)||'AL',Number.isFinite(price)&&price>=0?Math.round(price):null,Number.isFinite(beds)&&b.bedrooms!==''&&b.bedrooms!=null?Math.max(0,Math.round(beds)):null,Number.isFinite(baths)&&b.bathrooms!==''&&b.bathrooms!=null?Math.max(0,baths):null,Number.isFinite(sqft)&&b.sqft!==''&&b.sqft!=null?Math.max(0,Math.round(sqft)):null,source,url,/^https:\/\//i.test(String(b.imageUrl||''))?clean(b.imageUrl,1000):null,clean(b.notes,1000)]);
  return res.status(201).json({ok:true,id:rows[0]?.id});
 }
 if(b.action==="review"){
  const leadId=Number(b.id),status=clean(b.reviewStatus,30);
  if(!Number.isInteger(leadId)||leadId<=0||!['needs_review','verified','authorized','rejected','stale','published'].includes(status))return res.status(400).json({ok:false,error:"Invalid lead review update."});
  if(status==='published')return res.status(409).json({ok:false,error:"Publishing a third-party lead is disabled. Obtain listing authorization and add it through the owner property workflow first."});
  await db.query("UPDATE scout_leads SET review_status=$1,notes=COALESCE($2,notes),last_checked_at=now(),updated_at=now() WHERE id=$3",[status,b.notes==null?null:clean(b.notes,1000),leadId]);
  return res.json({ok:true});
 }
 if(b.action==="check"){
  const leadId=Number(b.id);
  if(!Number.isInteger(leadId)||leadId<=0)return res.status(400).json({ok:false,error:"Invalid lead id."});
  await db.query("UPDATE scout_leads SET last_checked_at=now(),updated_at=now(),source_status='manual_review_requested',review_status=CASE WHEN review_status IN ('authorized','published','rejected') THEN review_status ELSE 'needs_review' END WHERE id=$1",[leadId]);
  return res.json({ok:true,message:"Queued for owner verification; this action does not independently verify source availability."});
 }
 return res.status(400).json({ok:false,error:"Unknown scout action."});
}