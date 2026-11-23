import { db } from "hatchable";
export const access = "scheduler";
export const methods = ["POST"];

export default async function(req,res) {
  // Confirmed sold/off-market states are hidden immediately by their authoritative updater.
  // A temporary feed outage does not erase a recently verified local listing.
  const reverify = await db.query(
    "UPDATE homes h SET source_status='needs_reverification',status_note='Listing is in the 7–14 day reverification window; confirm availability and authorization.',status_updated_at=now() FROM scout_sources s WHERE h.source_name=s.source_name AND h.is_available=TRUE AND h.listing_status='available' AND h.last_verified_at IS NOT NULL AND h.last_verified_at < now()-interval '7 days' AND h.last_verified_at >= now()-interval '14 days' AND s.consecutive_feed_errors > 0 AND h.source_status <> 'needs_reverification' RETURNING h.id"
  );
  const hidden = await db.query(
    "UPDATE homes h SET is_available=FALSE,listing_status='hidden',source_status='stale_after_feed_outage',status_note='Hidden after 14 days without successful source verification during a feed outage.',status_updated_at=now() FROM scout_sources s WHERE h.source_name=s.source_name AND h.is_available=TRUE AND h.listing_status='available' AND h.last_verified_at IS NOT NULL AND h.last_verified_at < now()-interval '14 days' AND s.consecutive_feed_errors > 0 RETURNING h.id"
  );
  const feedHealth = await db.query(
    "SELECT count(*) FILTER (WHERE enabled=TRUE)::int AS enabled_sources,count(*) FILTER (WHERE enabled=TRUE AND consecutive_feed_errors>0)::int AS failing_sources,COALESCE(max(consecutive_feed_errors),0)::int AS max_consecutive_errors FROM scout_sources"
  );
  return res.json({
    ok:true,
    marked_for_reverification:reverify.rows.length,
    hidden_after_14_day_outage: hidden.rows.length,
    feed_health:feedHealth.rows[0]||{},
    policy:"Verified River Region inventory receives a 7-day feed-outage grace period, a 7–14 day reverification window, and is hidden after 14 days of continuous source errors. Listings without verified timestamps are not made public."
  });
}