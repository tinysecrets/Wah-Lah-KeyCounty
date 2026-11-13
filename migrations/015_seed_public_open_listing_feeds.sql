INSERT INTO scout_sources (source_name,feed_url,feed_format,enabled,rights_status,notes)
VALUES
('Trellistate public U.S. rental API','https://trellistate.com/api/v1/listings?listing_type=rent&country=US&limit=100','json',true,'display_allowed','Public read API. Respect agent policy, verify expiry and attribute the listing URL when redisplaying.'),
('Trellistate public U.S. sale-home API','https://trellistate.com/api/v1/listings?listing_type=sale&country=US&limit=100','json',true,'display_allowed','Public read API. Residential U.S. home-sale feed; verify expiry and attribute the listing URL when redisplaying.')
ON CONFLICT (feed_url) DO NOTHING;