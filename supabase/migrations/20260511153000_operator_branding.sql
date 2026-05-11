-- Operator branding — logo + accent colour for the redesigned /operators page.
--
-- logo_url is a public URL we can render directly. Each operator's value is
-- sourced from its public marketing site. We do not mirror these so they can
-- update naturally; the page falls back to an initial-tile if a URL 404s.
--
-- accent_color is a hex value used as the card border + tint behind the logo
-- when no park hero image is loaded yet.

ALTER TABLE operators ADD COLUMN IF NOT EXISTS logo_url     TEXT;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS accent_color TEXT;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS website_url  TEXT;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS tagline      TEXT;

-- Seed the eight current operators with their canonical logo + brand colour.
UPDATE operators SET
  logo_url     = 'https://www.ontarioparks.ca/images/logos/op/homepage-en.png',
  website_url  = 'https://www.ontarioparks.ca/',
  accent_color = '#1F6E3D',
  tagline      = 'Provincial parks · 339 sites across 115 parks'
WHERE id = 'ontario_parks';

UPDATE operators SET
  logo_url     = 'https://parks.canada.ca/Content/GCWeb/assets/sig-blk-en.svg',
  website_url  = 'https://parks.canada.ca/',
  accent_color = '#B91C1C',
  tagline      = 'Federal parks · national historic sites & national parks'
WHERE id = 'parks_canada';

UPDATE operators SET
  logo_url     = 'https://www.grandriver.ca/media/odpcnvjg/grcalogo.svg',
  website_url  = 'https://www.grandriver.ca/',
  accent_color = '#0F766E',
  tagline      = 'Grand River watershed · 8 conservation areas with camping'
WHERE id = 'gtc_grca';

UPDATE operators SET
  logo_url     = 'https://trca.ca/app/themes/TRCA/img/logo.png',
  website_url  = 'https://trca.ca/',
  accent_color = '#1E40AF',
  tagline      = 'Greater Toronto Area · Indian Line, Albion Hills, Glen Rouge'
WHERE id = 'gtc_trca';

UPDATE operators SET
  logo_url     = 'https://npca.ca/dist/img/npca-mark.svg',
  website_url  = 'https://npca.ca/',
  accent_color = '#0E7490',
  tagline      = 'Niagara watershed conservation areas'
WHERE id = 'gtc_npca';

UPDATE operators SET
  logo_url     = 'https://www.scrca.on.ca/wp-content/uploads/2020/04/scrca-logo-main.jpg',
  website_url  = 'https://www.scrca.on.ca/',
  accent_color = '#15803D',
  tagline      = 'St. Clair Region · A.W. Campbell, Warwick, Coldstream'
WHERE id = 'gtc_stclair';

UPDATE operators SET
  logo_url     = 'https://www.otonabeeconservation.com/media/0txnlgzh/otonabee-region-conservation-authority-horizontal-logo.svg',
  website_url  = 'https://www.otonabeeconservation.com/',
  accent_color = '#1D4ED8',
  tagline      = 'Otonabee Region · Beavermead & Warsaw Caves'
WHERE id = 'gtc_otonabee';

UPDATE operators SET
  logo_url     = 'https://www.lprca.on.ca/wp-content/uploads/2020/08/logo.png',
  website_url  = 'https://www.lprca.on.ca/',
  accent_color = '#0F766E',
  tagline      = 'Long Point Region · Backus Heritage, Deer Creek, Norfolk Conservation Area'
WHERE id = 'gtc_lprca';
