-- Three more Conservation Authorities on the GoingToCamp tenant model that
-- we missed in the first seed pass. Each one is its own goingtocamp subdomain.
--
-- After this migration runs, you still need to run:
--   npm run ingest:metadata -- --operator gtc_upperthames --operator gtc_maitland --operator gtc_catfish
--   npm run ingest:availability -- --operator gtc_upperthames --operator gtc_maitland --operator gtc_catfish
-- to populate parks/sites/availability.

INSERT INTO operators (id, name, vendor, base_url, booking_url, active,
                       logo_url, accent_color, website_url, tagline)
VALUES
  ('gtc_upperthames', 'Upper Thames River CA', 'goingtocamp',
   'https://upperthames.goingtocamp.com',
   'https://upperthames.goingtocamp.com/create-booking', TRUE,
   'https://thamesriver.on.ca/wp-content/uploads/UTRCA-logo-400x111.jpg',
   '#0D9488',
   'https://thamesriver.on.ca/',
   'Upper Thames watershed · Fanshawe, Wildwood, Pittock'),
  ('gtc_maitland', 'Maitland Valley CA', 'goingtocamp',
   'https://maitlandvalley.goingtocamp.com',
   'https://maitlandvalley.goingtocamp.com/create-booking', TRUE,
   'https://mvca.on.ca/wp-content/uploads/2016/12/MVCA-Logo.png',
   '#1D4ED8',
   'https://www.mvca.on.ca/',
   'Maitland watershed · Falls Reserve Conservation Area'),
  ('gtc_catfish', 'Catfish Creek CA', 'goingtocamp',
   'https://catfishcreek.goingtocamp.com',
   'https://catfishcreek.goingtocamp.com/create-booking', TRUE,
   'https://catfishcreek.com/assets/img/logo.png',
   '#15803D',
   'https://catfishcreek.com/',
   'Catfish Creek watershed · Springwater Conservation Area')
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name, vendor = excluded.vendor,
  base_url = excluded.base_url, booking_url = excluded.booking_url, active = excluded.active,
  logo_url = excluded.logo_url, accent_color = excluded.accent_color,
  website_url = excluded.website_url, tagline = excluded.tagline;
