import { db } from "hatchable";
export const access = "scheduler";
export const methods = ["POST"];
export default async function(req,res){
  // A listing that has not been re-confirmed for 24 hours is hidden automatically.
  const result=await db.query("UPDATE homes SET is_available=false,listing_status='hidden',status_note='Auto-hidden because listing status was not re-confirmed within 24 hours.',status_updated_at=now() WHERE is_available=true AND listing_status='available' AND status_updated_at < now() - interval '24 hours' RETURNING id");
  return res.json({ok:true,hidden:result.rows.length,policy:"Public listings must be re-confirmed every 24 hours or are hidden from public search."});
}