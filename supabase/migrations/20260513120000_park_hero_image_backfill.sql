-- Curated hero image backfill for parks whose reservation records either do
-- not ship photos or used a host the image proxy cannot fetch reliably.
--
-- Conservation-area images come from each GoingToCamp tenant's public
-- /api/resourceLocation payload. Parks Canada images come from the first
-- page-level hero image on the linked official Parks Canada visit page.

UPDATE operators SET
  hero_image_url = 'https://maitlandvalley.goingtocamp.com/images/b670ebe5-4e19-4c75-9f4f-0969e0978d6f.png'
WHERE id = 'gtc_maitland';

UPDATE operators SET
  hero_image_url = 'https://pcweb2.azureedge.net/-/media/pn-np/on/1000/WET4/visit/ti_visit_1920.jpg?modified=20221122020015'
WHERE id = 'parks_canada';

UPDATE parks SET
  hero_image_url = 'https://www.grcacamping.ca/images/7539e603-9893-4216-b5ce-b02209eeb678.jpg'
WHERE operator_id = 'gtc_grca'
  AND name = 'Brant';

UPDATE parks SET
  hero_image_url = 'https://longpoint.goingtocamp.com/images/aa6f6128-2004-4c57-bb30-f851971b9da1.png'
WHERE operator_id = 'gtc_lprca'
  AND name = 'Backus Heritage';

UPDATE parks SET
  hero_image_url = 'https://camping.trca.ca/images/cdea72be-59d0-491a-820e-57cf9f0a21f6.jpg'
WHERE operator_id = 'gtc_trca'
  AND name = 'Albion Hills';

UPDATE parks SET
  hero_image_url = 'https://maitlandvalley.goingtocamp.com/images/b670ebe5-4e19-4c75-9f4f-0969e0978d6f.png'
WHERE operator_id = 'gtc_maitland'
  AND name = 'Falls Reserve';

UPDATE parks SET
  hero_image_url = 'https://niagara.goingtocamp.com/images/0889dd35-0c43-46ba-9438-0f03b5e0ec38.jpg'
WHERE operator_id = 'gtc_npca'
  AND name = 'Chippawa Creek';

UPDATE parks SET
  hero_image_url = 'https://otonabee.goingtocamp.com/images/b08933b3-096c-4f1e-921f-f19056b2b14b.jpg'
WHERE operator_id = 'gtc_otonabee'
  AND name = 'Beavermead';

UPDATE parks SET
  hero_image_url = 'https://www.ontarioparks.ca/images/headers/parks/bonnechere-summer-1200.jpg'
WHERE operator_id = 'ontario_parks'
  AND name = 'Bonnechere';

UPDATE parks SET
  hero_image_url = 'https://pcweb2.azureedge.net/-/media/pn-np/on/bruce/WET4/activ/Grotto_1920.jpg?modified=20230303152922'
WHERE operator_id = 'parks_canada'
  AND name = 'Bruce Peninsula - Parking';

UPDATE parks SET
  hero_image_url = 'https://pcweb2.azureedge.net/-/media/pn-np/on/georg/WET4/visit/visit_gbi_1920.jpg?modified=20221121143026'
WHERE operator_id = 'parks_canada'
  AND name = 'Christian Beach Cabins #1 - 4';

UPDATE parks SET
  hero_image_url = 'https://pcweb2.azureedge.net/-/media/pn-np/on/bruce/WET4/visit/planvisit_1920.jpg?modified=20221116161209'
WHERE operator_id = 'parks_canada'
  AND name = 'Cyprus Lake';

UPDATE parks SET
  hero_image_url = 'https://pcweb2.azureedge.net/-/media/amnc-nmca/on/fathomfive/WET4/visit/FF_visit_1920.jpg?modified=20221117182932'
WHERE operator_id = 'parks_canada'
  AND name = 'Fathom Five';

UPDATE parks SET
  hero_image_url = 'https://pcweb2.azureedge.net/-/media/pn-np/on/Pelee/WET4/visit/1920x480-visit.jpg?modified=20221116163503'
WHERE operator_id = 'parks_canada'
  AND name = 'Point Pelee';

UPDATE parks SET
  hero_image_url = 'https://pcweb2.azureedge.net/-/media/pn-np/on/pukaskwa/WET4/2022/headers/T_Puk_03.jpg?modified=20221115154545'
WHERE operator_id = 'parks_canada'
  AND name = 'Pukaskwa';

UPDATE parks SET
  hero_image_url = 'https://pcweb2.azureedge.net/-/media/lhn-nhs/on/rideau/WET4/visit/acceuil-home/plan-visit-1920x480_2.jpg?modified=20230914150420'
WHERE operator_id = 'parks_canada'
  AND name = 'Rideau Canal';

UPDATE parks SET
  hero_image_url = 'https://pcweb2.azureedge.net/-/media/pn-np/on/1000/WET4/visit/ti_visit_1920.jpg?modified=20221122020015'
WHERE operator_id = 'parks_canada'
  AND name = 'Thousand Islands';

UPDATE parks SET
  hero_image_url = 'https://pcweb2.azureedge.net/-/media/lhn-nhs/on/trentsevern/WET4/hero-image/fenelon-1920x480.jpg?modified=20230914153904'
WHERE operator_id = 'parks_canada'
  AND name = 'Trent-Severn Waterway';
