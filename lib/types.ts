export type Vendor = "camis5" | "goingtocamp" | "pcrs";

export type Operator = {
  id: string;
  name: string;
  vendor: Vendor;
  base_url: string;
  booking_url: string;
  active: boolean;
};

export type Park = {
  id: string;
  operator_id: string;
  vendor_park_id: string;
  slug: string;
  name: string;
  description: string;
  region: string;
  location: { lat: number; lng: number };
  address: string;
  hero_image_url?: string;
  vendor_url: string;
};

export type Campground = {
  id: string;
  park_id: string;
  vendor_map_id: string;
  name: string;
  description?: string;
};

export type SiteType = "tent" | "rv" | "cabin" | "yurt" | "backcountry";

export type Site = {
  id: string;
  campground_id: string;
  vendor_site_id: string;
  name: string;
  site_type: SiteType;
  /** Operator's own human label for this site type (e.g., "Serviced (Electric)"). */
  site_type_label?: string | null;
  /** Camis iconType. Joins to the per-operator site_type_labels dictionary. */
  icon_type?: number | null;
  max_party_size: number;
  max_equipment_length_ft: number | null;
  has_electric: boolean;
  has_water: boolean;
  has_sewer: boolean;
  is_pull_through: boolean;
  is_accessible: boolean;
  is_pet_friendly: boolean;
  is_waterfront: boolean;
  amenities: string[];
  /** Which CampMap (id) this site is positioned on, when known. */
  camp_map_id?: string | null;
  /** Pixel coordinates on the operator-branded campground map image. */
  map_x?: number | null;
  map_y?: number | null;
};

export type EquipmentOption = {
  operator_id: string;
  equipment_category_id: number;
  sub_equipment_category_id: number;
  name: string;
  order_index: number;
};

/**
 * A single operator-branded campground map. One Park may have several (separate
 * loops, sections, day-use areas). Sites carry the (camp_map_id, map_x, map_y)
 * tuple so we can render them as dots over the operator's own PNG.
 */
export type CampMap = {
  id: string;
  park_id: string;
  campground_id: string;
  vendor_map_id: string;
  /** Operator's name for the section (e.g. "Campground 1", "Loop A"). */
  name: string | null;
  /** Operator's site-range subtitle (e.g. "Sites 1-23", "Walk-in tents"). */
  description: string | null;
  image_url: string;
  /** Pixel size of the PNG. */
  x_dimension: number;
  y_dimension: number;
};

export type AvailabilityStatus = "available" | "reserved" | "closed" | "unknown";

export type AvailabilityRow = {
  site_id: string;
  night_date: string;
  status: AvailabilityStatus;
  price_cents: number | null;
  last_checked_at: string;
};

export type SearchResult = {
  site: {
    id: string;
    name: string;
    site_type: SiteType;
    amenities: string[];
  };
  campground: { id: string; name: string };
  park: {
    slug: string;
    name: string;
    operator: string;
    operator_id: string;
    location: { lat: number; lng: number };
    distance_km?: number;
  };
  availability: {
    nights: string[];
    price_cents: number | null;
    last_checked_at: string;
  };
  booking_url: string;
};

export type SearchResponse = {
  results: SearchResult[];
  total: number;
  freshness_p50_minutes: number;
};

export const AMENITIES: Record<string, { label: string; category: string }> = {
  electric_15a: { label: "15A electric", category: "utilities" },
  electric_30a: { label: "30A electric", category: "utilities" },
  electric_50a: { label: "50A electric", category: "utilities" },
  water: { label: "Water hookup", category: "utilities" },
  sewer: { label: "Sewer hookup", category: "utilities" },
  pull_through: { label: "Pull-through", category: "rv" },
  fire_pit: { label: "Fire pit", category: "site" },
  picnic_table: { label: "Picnic table", category: "site" },
  shade: { label: "Shaded", category: "site" },
  waterfront: { label: "Waterfront", category: "water_access" },
  lake_swim: { label: "Swim access", category: "water_access" },
  beach: { label: "Beach", category: "water_access" },
  pet_friendly: { label: "Pet-friendly", category: "access" },
  accessible: { label: "Accessible", category: "access" },
  showers: { label: "Showers nearby", category: "facilities" },
  flush_toilets: { label: "Flush toilets", category: "facilities" },
};
