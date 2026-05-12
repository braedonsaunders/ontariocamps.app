-- Official Parks of the St. Lawrence hero images.
--
-- Images are sourced from the public stlawrenceparks.com camping pages via
-- their page-level Open Graph images.

UPDATE operators SET
  hero_image_url = 'https://www.stlawrenceparks.com/wp-content/uploads/sites/4/2022/02/Camping-Banner.jpg'
WHERE id = 'st_lawrence_parks';

UPDATE parks SET
  hero_image_url = 'https://www.stlawrenceparks.com/wp-content/uploads/sites/4/2024/05/Parks-BB-Drone-2023-H-13-scaled.jpg'
WHERE operator_id = 'st_lawrence_parks'
  AND name = 'Brown''s Bay Beach';

UPDATE parks SET
  hero_image_url = 'https://www.stlawrenceparks.com/wp-content/uploads/sites/4/2025/05/V-Lake-16.jpg'
WHERE operator_id = 'st_lawrence_parks'
  AND name = 'Crysler Park Marina';

UPDATE parks SET
  hero_image_url = 'https://www.stlawrenceparks.com/wp-content/uploads/sites/4/2021/11/cimg-4.jpg'
WHERE operator_id = 'st_lawrence_parks'
  AND name = 'Farran';

UPDATE parks SET
  hero_image_url = 'https://www.stlawrenceparks.com/wp-content/uploads/sites/4/2024/09/DSC07885-scaled-e1727291632754.jpg'
WHERE operator_id = 'st_lawrence_parks'
  AND name = 'Glengarry';

UPDATE parks SET
  hero_image_url = 'https://www.stlawrenceparks.com/wp-content/uploads/sites/4/2026/02/DavidTaillon_SeniorParkWorker_IvyLea_2025_4-scaled.jpg'
WHERE operator_id = 'st_lawrence_parks'
  AND name = 'Ivy Lea';

UPDATE parks SET
  hero_image_url = 'https://www.stlawrenceparks.com/wp-content/uploads/sites/4/2022/02/McLaren-1.jpg'
WHERE operator_id = 'st_lawrence_parks'
  AND name = 'McLaren';

UPDATE parks SET
  hero_image_url = 'https://www.stlawrenceparks.com/wp-content/uploads/sites/4/2022/02/Mille-Roches-1.jpg'
WHERE operator_id = 'st_lawrence_parks'
  AND name = 'Mille Roches';

UPDATE parks SET
  hero_image_url = 'https://www.stlawrenceparks.com/wp-content/uploads/sites/4/2022/07/Riverside_Cedar_2022-6.jpg'
WHERE operator_id = 'st_lawrence_parks'
  AND name = 'Riverside-Cedar';

UPDATE parks SET
  hero_image_url = 'https://www.stlawrenceparks.com/wp-content/uploads/sites/4/2026/04/UCMBS_WaterfrontWalkIn_Sites-scaled.jpg'
WHERE operator_id = 'st_lawrence_parks'
  AND name = 'Upper Canada Migratory Bird Sanctuary';

UPDATE parks SET
  hero_image_url = 'https://www.stlawrenceparks.com/wp-content/uploads/sites/4/2026/04/Camping-Woodlands-2023-H-98-2048x1356.png'
WHERE operator_id = 'st_lawrence_parks'
  AND name = 'Woodlands';
