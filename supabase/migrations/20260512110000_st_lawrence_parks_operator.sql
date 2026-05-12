-- Add Parks of the St. Lawrence as a CAMIS-backed operator.
--
-- The tenant lives on its own reservations.parks.on.ca host and exposes the
-- same CAMIS API surface as Ontario Parks / Parks Canada. Metadata ingest
-- still needs to run after this migration to populate parks and sites.

INSERT INTO operators (id, name, vendor, base_url, booking_url, active,
                       logo_url, accent_color, website_url, tagline)
VALUES
  ('st_lawrence_parks', 'Parks of the St. Lawrence', 'camis5',
   'https://reservations.parks.on.ca',
   'https://reservations.parks.on.ca/create-booking/results', TRUE,
   'https://www.stlawrenceparks.com/wp-content/uploads/2021/08/parks-en-transparent.png',
   '#0E7490',
   'https://www.stlawrenceparks.com/',
   'Eastern Ontario · St. Lawrence River campgrounds and beaches')
ON CONFLICT (id) DO UPDATE SET
  name = excluded.name,
  vendor = excluded.vendor,
  base_url = excluded.base_url,
  booking_url = excluded.booking_url,
  active = excluded.active,
  logo_url = excluded.logo_url,
  accent_color = excluded.accent_color,
  website_url = excluded.website_url,
  tagline = excluded.tagline;
