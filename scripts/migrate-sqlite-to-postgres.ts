/**
 * One-shot migration: read every row from the local SQLite snapshot and
 * insert it into Supabase Postgres in batches.
 *
 *   npm run migrate
 *
 * Safe to re-run — every insert is an UPSERT. If anything fails partway
 * through, just run it again.
 */

import Database from "better-sqlite3";
import { resolve } from "node:path";
import postgres from "postgres";

const SQLITE_PATH = resolve(process.cwd(), "data", "ontariocamps.db");

async function main() {
  const directUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!directUrl) throw new Error("DATABASE_DIRECT_URL not set");

  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pg = postgres(directUrl, {
    ssl: "require",
    prepare: true,
    max: 4,
    connect_timeout: 15,
  });

  const t0 = Date.now();

  // ─── operators ──────────────────────────────────────────────────────────
  {
    const rows = sqlite.prepare(`SELECT id, name, vendor, base_url, booking_url, active FROM operators`).all() as Array<{
      id: string; name: string; vendor: string; base_url: string; booking_url: string; active: number;
    }>;
    const pgRows = rows.map((r) => ({ ...r, active: r.active === 1 }));
    if (pgRows.length) {
      await pg`
        INSERT INTO operators ${pg(pgRows, "id", "name", "vendor", "base_url", "booking_url", "active")}
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name, vendor = excluded.vendor,
          base_url = excluded.base_url, booking_url = excluded.booking_url,
          active = excluded.active
      `;
    }
    console.error(`  operators: ${pgRows.length}`);
  }

  // ─── parks ──────────────────────────────────────────────────────────────
  {
    const rows = sqlite.prepare(`SELECT id, operator_id, vendor_park_id, slug, name, description, region, lat, lng, address, hero_image_url, vendor_url FROM parks`).all();
    if (rows.length) {
      await pg`
        INSERT INTO parks ${pg(rows as Record<string, unknown>[], "id", "operator_id", "vendor_park_id", "slug", "name", "description", "region", "lat", "lng", "address", "hero_image_url", "vendor_url")}
        ON CONFLICT (id) DO UPDATE SET
          operator_id = excluded.operator_id, vendor_park_id = excluded.vendor_park_id,
          slug = excluded.slug, name = excluded.name, description = excluded.description,
          region = excluded.region, lat = excluded.lat, lng = excluded.lng,
          address = excluded.address, hero_image_url = excluded.hero_image_url,
          vendor_url = excluded.vendor_url
      `;
    }
    console.error(`  parks: ${rows.length}`);
  }

  // ─── campgrounds ────────────────────────────────────────────────────────
  {
    const rows = sqlite.prepare(`SELECT id, park_id, vendor_map_id, name FROM campgrounds`).all();
    if (rows.length) {
      await pg`
        INSERT INTO campgrounds ${pg(rows as Record<string, unknown>[], "id", "park_id", "vendor_map_id", "name")}
        ON CONFLICT (id) DO UPDATE SET
          park_id = excluded.park_id, vendor_map_id = excluded.vendor_map_id, name = excluded.name
      `;
    }
    console.error(`  campgrounds: ${rows.length}`);
  }

  // ─── camp_maps ──────────────────────────────────────────────────────────
  {
    const rows = sqlite.prepare(`SELECT id, park_id, campground_id, vendor_map_id, name, image_url, x_dimension, y_dimension FROM camp_maps`).all();
    if (rows.length) {
      await pg`
        INSERT INTO camp_maps ${pg(rows as Record<string, unknown>[], "id", "park_id", "campground_id", "vendor_map_id", "name", "image_url", "x_dimension", "y_dimension")}
        ON CONFLICT (id) DO UPDATE SET
          park_id = excluded.park_id, campground_id = excluded.campground_id,
          vendor_map_id = excluded.vendor_map_id, name = excluded.name,
          image_url = excluded.image_url, x_dimension = excluded.x_dimension,
          y_dimension = excluded.y_dimension
      `;
    }
    console.error(`  camp_maps: ${rows.length}`);
  }

  // ─── site_type_labels ───────────────────────────────────────────────────
  {
    const rows = sqlite.prepare(`SELECT operator_id, icon_type, label FROM site_type_labels`).all();
    if (rows.length) {
      await pg`
        INSERT INTO site_type_labels ${pg(rows as Record<string, unknown>[], "operator_id", "icon_type", "label")}
        ON CONFLICT (operator_id, icon_type) DO UPDATE SET label = excluded.label
      `;
    }
    console.error(`  site_type_labels: ${rows.length}`);
  }

  // ─── equipment_categories ───────────────────────────────────────────────
  {
    const rows = sqlite.prepare(`SELECT operator_id, equipment_category_id, sub_equipment_category_id, name, order_index FROM equipment_categories`).all();
    if (rows.length) {
      await pg`
        INSERT INTO equipment_categories ${pg(rows as Record<string, unknown>[], "operator_id", "equipment_category_id", "sub_equipment_category_id", "name", "order_index")}
        ON CONFLICT (operator_id, equipment_category_id, sub_equipment_category_id) DO UPDATE SET
          name = excluded.name, order_index = excluded.order_index
      `;
    }
    console.error(`  equipment_categories: ${rows.length}`);
  }

  // ─── operator_fetch_config ──────────────────────────────────────────────
  {
    const rows = sqlite.prepare(`SELECT operator_id, campsite_booking_category_id, equipment_category_id, sub_equipment_category_id FROM operator_fetch_config`).all();
    if (rows.length) {
      await pg`
        INSERT INTO operator_fetch_config ${pg(rows as Record<string, unknown>[], "operator_id", "campsite_booking_category_id", "equipment_category_id", "sub_equipment_category_id")}
        ON CONFLICT (operator_id) DO UPDATE SET
          campsite_booking_category_id = excluded.campsite_booking_category_id,
          equipment_category_id = excluded.equipment_category_id,
          sub_equipment_category_id = excluded.sub_equipment_category_id
      `;
    }
    console.error(`  operator_fetch_config: ${rows.length}`);
  }

  // ─── sites ──────────────────────────────────────────────────────────────
  {
    const rows = sqlite.prepare(`SELECT id, campground_id, vendor_site_id, name, site_type, site_type_label, icon_type, max_party_size, max_equipment_length_ft, has_electric, has_water, has_sewer, is_pull_through, is_accessible, is_pet_friendly, is_waterfront, amenities, camp_map_id, map_x, map_y, vendor_resource_location_id, vendor_resource_id, vendor_booking_category_id FROM sites`).all() as Array<Record<string, unknown>>;
    const BATCH = 1000;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map((r) => ({
        ...r,
        has_electric: r.has_electric === 1,
        has_water: r.has_water === 1,
        has_sewer: r.has_sewer === 1,
        is_pull_through: r.is_pull_through === 1,
        is_accessible: r.is_accessible === 1,
        is_pet_friendly: r.is_pet_friendly === 1,
        is_waterfront: r.is_waterfront === 1,
        amenities: JSON.parse((r.amenities as string) ?? "[]"),
      }));
      await pg`
        INSERT INTO sites ${pg(batch, "id", "campground_id", "vendor_site_id", "name", "site_type", "site_type_label", "icon_type", "max_party_size", "max_equipment_length_ft", "has_electric", "has_water", "has_sewer", "is_pull_through", "is_accessible", "is_pet_friendly", "is_waterfront", "amenities", "camp_map_id", "map_x", "map_y", "vendor_resource_location_id", "vendor_resource_id", "vendor_booking_category_id")}
        ON CONFLICT (id) DO UPDATE SET
          campground_id = excluded.campground_id, vendor_site_id = excluded.vendor_site_id,
          name = excluded.name, site_type = excluded.site_type,
          site_type_label = excluded.site_type_label, icon_type = excluded.icon_type,
          max_party_size = excluded.max_party_size,
          max_equipment_length_ft = excluded.max_equipment_length_ft,
          has_electric = excluded.has_electric, has_water = excluded.has_water,
          has_sewer = excluded.has_sewer, is_pull_through = excluded.is_pull_through,
          is_accessible = excluded.is_accessible, is_pet_friendly = excluded.is_pet_friendly,
          is_waterfront = excluded.is_waterfront, amenities = excluded.amenities,
          camp_map_id = excluded.camp_map_id, map_x = excluded.map_x, map_y = excluded.map_y,
          vendor_resource_location_id = excluded.vendor_resource_location_id,
          vendor_resource_id = excluded.vendor_resource_id,
          vendor_booking_category_id = excluded.vendor_booking_category_id
      `;
    }
    console.error(`  sites: ${rows.length}`);
  }

  // ─── site_availability ──────────────────────────────────────────────────
  {
    const totalRow = sqlite.prepare(`SELECT count(*) as n FROM site_availability`).get() as { n: number };
    const total = totalRow.n;
    console.error(`  site_availability: ${total.toLocaleString()} rows queued`);
    const BATCH = 5000;
    let inserted = 0;
    const iter = sqlite.prepare(`SELECT site_id, night_date, status, last_checked_at FROM site_availability`).iterate() as IterableIterator<Record<string, unknown>>;
    let batch: Array<Record<string, unknown>> = [];
    const t0Avail = Date.now();
    for (const row of iter) {
      batch.push(row);
      if (batch.length >= BATCH) {
        await pg`
          INSERT INTO site_availability ${pg(batch, "site_id", "night_date", "status", "last_checked_at")}
          ON CONFLICT (site_id, night_date) DO UPDATE SET
            status = excluded.status, last_checked_at = excluded.last_checked_at
        `;
        inserted += batch.length;
        batch = [];
        if (inserted % 50000 === 0) {
          const elapsed = (Date.now() - t0Avail) / 1000;
          const rate = inserted / elapsed;
          const eta = (total - inserted) / rate;
          console.error(`    ${inserted.toLocaleString()}/${total.toLocaleString()} (${rate.toFixed(0)} rows/s · ETA ${(eta / 60).toFixed(1)} min)`);
        }
      }
    }
    if (batch.length) {
      await pg`
        INSERT INTO site_availability ${pg(batch, "site_id", "night_date", "status", "last_checked_at")}
        ON CONFLICT (site_id, night_date) DO UPDATE SET
          status = excluded.status, last_checked_at = excluded.last_checked_at
      `;
      inserted += batch.length;
    }
    console.error(`  site_availability: ${inserted.toLocaleString()} inserted`);
  }

  // ─── refresh_meta ───────────────────────────────────────────────────────
  {
    const rows = sqlite.prepare(`SELECT refresh_type, last_success_at FROM refresh_meta`).all();
    if (rows.length) {
      await pg`
        INSERT INTO refresh_meta ${pg(rows as Record<string, unknown>[], "refresh_type", "last_success_at")}
        ON CONFLICT (refresh_type) DO UPDATE SET last_success_at = excluded.last_success_at
      `;
    }
    console.error(`  refresh_meta: ${rows.length}`);
  }

  sqlite.close();
  await pg.end();
  console.error(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error("migrate failed:", e);
  process.exit(1);
});
