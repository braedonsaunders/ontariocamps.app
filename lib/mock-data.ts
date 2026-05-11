import type { Operator, Park, Campground, Site, AvailabilityRow, SiteType } from "./types";
import { eachDate } from "./utils";

export const operators: Operator[] = [
  {
    id: "ontario_parks",
    name: "Ontario Parks",
    vendor: "camis5",
    base_url: "https://reservations.ontarioparks.ca",
    booking_url: "https://reservations.ontarioparks.ca/create-booking/results",
    active: true,
  },
  {
    id: "parks_canada",
    name: "Parks Canada",
    vendor: "pcrs",
    base_url: "https://reservation.pc.gc.ca",
    booking_url: "https://reservation.pc.gc.ca/create-booking/results",
    active: true,
  },
  {
    id: "gtc_lprca",
    name: "Long Point Region CA",
    vendor: "goingtocamp",
    base_url: "https://longpoint.goingtocamp.com",
    booking_url: "https://longpoint.goingtocamp.com/create-booking/results",
    active: true,
  },
  {
    id: "gtc_grand",
    name: "Grand River CA",
    vendor: "goingtocamp",
    base_url: "https://grandriver.goingtocamp.com",
    booking_url: "https://grandriver.goingtocamp.com/create-booking/results",
    active: true,
  },
  {
    id: "gtc_trca",
    name: "Toronto and Region CA",
    vendor: "goingtocamp",
    base_url: "https://trcacamping.ca",
    booking_url: "https://trcacamping.ca/create-booking/results",
    active: true,
  },
  {
    id: "gtc_saugeen",
    name: "Saugeen Valley CA",
    vendor: "goingtocamp",
    base_url: "https://saugeen.goingtocamp.com",
    booking_url: "https://saugeen.goingtocamp.com/create-booking/results",
    active: true,
  },
];

export const parks: Park[] = [
  {
    id: "p_algonquin",
    operator_id: "ontario_parks",
    vendor_park_id: "303",
    slug: "algonquin",
    name: "Algonquin Provincial Park",
    description:
      "Ontario's flagship park — 7,653 km² of lake-stitched canoe routes, dense maple-pine forest, and roadside campgrounds along Highway 60.",
    region: "Central",
    location: { lat: 45.836, lng: -78.379 },
    address: "Highway 60, Algonquin Park, ON",
    hero_image_url: "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1200",
    vendor_url: "https://reservations.ontarioparks.ca/en/Algonquin",
  },
  {
    id: "p_killarney",
    operator_id: "ontario_parks",
    vendor_park_id: "311",
    slug: "killarney",
    name: "Killarney Provincial Park",
    description:
      "White quartzite ridges of the La Cloche range over deep clear lakes. One of the highest-demand reservation windows in the province.",
    region: "Northeastern",
    location: { lat: 46.013, lng: -81.401 },
    address: "960 Hwy 637, Killarney, ON",
    hero_image_url: "https://images.unsplash.com/photo-1496080174650-637e3f22fa03?w=1200",
    vendor_url: "https://reservations.ontarioparks.ca/en/Killarney",
  },
  {
    id: "p_pinery",
    operator_id: "ontario_parks",
    vendor_park_id: "326",
    slug: "pinery",
    name: "Pinery Provincial Park",
    description:
      "10 km of Lake Huron sand beach backed by oak savanna and the Old Ausable Channel — premier summer car-camping in the southwest.",
    region: "Southwestern",
    location: { lat: 43.247, lng: -81.831 },
    address: "9526 Lakeshore Rd, Lambton Shores, ON",
    hero_image_url: "https://images.unsplash.com/photo-1455496231601-e6195da1f841?w=1200",
    vendor_url: "https://reservations.ontarioparks.ca/en/Pinery",
  },
  {
    id: "p_sandbanks",
    operator_id: "ontario_parks",
    vendor_park_id: "335",
    slug: "sandbanks",
    name: "Sandbanks Provincial Park",
    description:
      "The world's largest bay-mouth barrier dune formation. Three beaches, Outlet River paddling, prime swimming.",
    region: "Southeastern",
    location: { lat: 43.913, lng: -77.241 },
    address: "3004 County Rd 12, Picton, ON",
    hero_image_url: "https://images.unsplash.com/photo-1502780402662-acc01917cf91?w=1200",
    vendor_url: "https://reservations.ontarioparks.ca/en/Sandbanks",
  },
  {
    id: "p_bonecho",
    operator_id: "ontario_parks",
    vendor_park_id: "302",
    slug: "bon-echo",
    name: "Bon Echo Provincial Park",
    description:
      "Mazinaw Rock — a 1.5 km cliff rising 100 m from the lake, with Indigenous pictographs along the waterline.",
    region: "Southeastern",
    location: { lat: 44.892, lng: -77.211 },
    address: "16151 Hwy 41, Cloyne, ON",
    hero_image_url: "https://images.unsplash.com/photo-1465056836041-7f43ac27dcb5?w=1200",
    vendor_url: "https://reservations.ontarioparks.ca/en/BonEcho",
  },
  {
    id: "p_bruce",
    operator_id: "parks_canada",
    vendor_park_id: "bp",
    slug: "bruce-peninsula",
    name: "Bruce Peninsula National Park",
    description:
      "Cliffs over the turquoise of Georgian Bay, the Grotto sea cave, and the northern reach of the Bruce Trail.",
    region: "Western",
    location: { lat: 45.232, lng: -81.499 },
    address: "469 Cyprus Lake Rd, Tobermory, ON",
    hero_image_url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200",
    vendor_url: "https://reservation.pc.gc.ca/Bruce",
  },
  {
    id: "p_pukaskwa",
    operator_id: "parks_canada",
    vendor_park_id: "pk",
    slug: "pukaskwa",
    name: "Pukaskwa National Park",
    description:
      "Wild Lake Superior coastline, the only national park in Ontario protecting boreal forest. Hattie Cove drive-in plus interior coastal hike.",
    region: "Northern",
    location: { lat: 48.587, lng: -86.286 },
    address: "Hattie Cove, Heron Bay, ON",
    hero_image_url: "https://images.unsplash.com/photo-1499678329028-101435549a4e?w=1200",
    vendor_url: "https://reservation.pc.gc.ca/Pukaskwa",
  },
  {
    id: "p_georgian_bay",
    operator_id: "parks_canada",
    vendor_park_id: "gb",
    slug: "georgian-bay-islands",
    name: "Georgian Bay Islands National Park",
    description:
      "63 small islands within Georgian Bay's UNESCO biosphere reserve. Boat-in only; the Day Tripper shuttle runs from Honey Harbour.",
    region: "Central",
    location: { lat: 44.879, lng: -79.864 },
    address: "Honey Harbour, ON",
    hero_image_url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200",
    vendor_url: "https://reservation.pc.gc.ca/GeorgianBay",
  },
  {
    id: "p_longpoint",
    operator_id: "gtc_lprca",
    vendor_park_id: "deer-creek",
    slug: "deer-creek-conservation-area",
    name: "Deer Creek Conservation Area",
    description:
      "Long Point Region CA's quiet wooded campground with reservoir swimming and trails through Carolinian forest.",
    region: "Southwestern",
    location: { lat: 42.866, lng: -80.456 },
    address: "Cultus, ON",
    hero_image_url: "https://images.unsplash.com/photo-1471115853179-bb1d604434e0?w=1200",
    vendor_url: "https://longpoint.goingtocamp.com",
  },
  {
    id: "p_grand_byng",
    operator_id: "gtc_grand",
    vendor_park_id: "byng-island",
    slug: "byng-island",
    name: "Byng Island Conservation Area",
    description:
      "Grand River CA's largest park — pool, paddling, and 400+ campsites along an oxbow of the Grand.",
    region: "Southwestern",
    location: { lat: 42.987, lng: -79.872 },
    address: "Dunnville, ON",
    hero_image_url: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=1200",
    vendor_url: "https://grandriver.goingtocamp.com",
  },
  {
    id: "p_trca_indian_line",
    operator_id: "gtc_trca",
    vendor_park_id: "indian-line",
    slug: "indian-line",
    name: "Indian Line Campground",
    description:
      "TRCA's only campground inside the GTA — a base camp 10 minutes from Pearson, beside Claireville Conservation Area.",
    region: "GTA",
    location: { lat: 43.737, lng: -79.628 },
    address: "7625 Finch Ave W, Toronto, ON",
    hero_image_url: "https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=1200",
    vendor_url: "https://trcacamping.ca",
  },
  {
    id: "p_saugeen_durham",
    operator_id: "gtc_saugeen",
    vendor_park_id: "durham",
    slug: "durham-conservation-area",
    name: "Durham Conservation Area",
    description:
      "Saugeen Valley CA's largest site along the Saugeen River — pool, trails, and ~150 serviced sites.",
    region: "Western",
    location: { lat: 44.176, lng: -80.819 },
    address: "Durham, ON",
    hero_image_url: "https://images.unsplash.com/photo-1444090542259-0af8fa96557e?w=1200",
    vendor_url: "https://saugeen.goingtocamp.com",
  },
];

export const campgrounds: Campground[] = [
  { id: "cg_algonquin_mew", park_id: "p_algonquin", vendor_map_id: "mew-lake", name: "Mew Lake" },
  { id: "cg_algonquin_lop", park_id: "p_algonquin", vendor_map_id: "lake-of-two-rivers", name: "Lake of Two Rivers" },
  { id: "cg_algonquin_pog", park_id: "p_algonquin", vendor_map_id: "pog-lake", name: "Pog Lake" },
  { id: "cg_killarney_george", park_id: "p_killarney", vendor_map_id: "george-lake", name: "George Lake" },
  { id: "cg_pinery_burley", park_id: "p_pinery", vendor_map_id: "burley", name: "Burley" },
  { id: "cg_pinery_dunes", park_id: "p_pinery", vendor_map_id: "dunes", name: "Dunes" },
  { id: "cg_sandbanks_outlet", park_id: "p_sandbanks", vendor_map_id: "outlet", name: "Outlet" },
  { id: "cg_sandbanks_woodlands", park_id: "p_sandbanks", vendor_map_id: "woodlands", name: "Woodlands" },
  { id: "cg_bonecho_main", park_id: "p_bonecho", vendor_map_id: "mazinaw", name: "Mazinaw" },
  { id: "cg_bruce_cyprus", park_id: "p_bruce", vendor_map_id: "cyprus-lake", name: "Cyprus Lake" },
  { id: "cg_pukaskwa_hattie", park_id: "p_pukaskwa", vendor_map_id: "hattie-cove", name: "Hattie Cove" },
  { id: "cg_gb_beausoleil", park_id: "p_georgian_bay", vendor_map_id: "cedar-spring", name: "Cedar Spring (Beausoleil Is.)" },
  { id: "cg_lp_deer", park_id: "p_longpoint", vendor_map_id: "deer-creek-main", name: "Deer Creek Main" },
  { id: "cg_grand_byng", park_id: "p_grand_byng", vendor_map_id: "byng-island", name: "Byng Island" },
  { id: "cg_trca_indian", park_id: "p_trca_indian_line", vendor_map_id: "indian-line", name: "Indian Line" },
  { id: "cg_saugeen_durham", park_id: "p_saugeen_durham", vendor_map_id: "durham-main", name: "Durham Main" },
];

// Deterministic seeded PRNG so server + client agree
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generateSites(): Site[] {
  const sites: Site[] = [];
  const types: SiteType[] = ["tent", "rv", "cabin", "yurt"];

  for (const cg of campgrounds) {
    const rng = mulberry32(hashStr(cg.id));
    const count = 14 + Math.floor(rng() * 14);
    for (let i = 1; i <= count; i++) {
      const t: SiteType = rng() < 0.55 ? "tent" : rng() < 0.85 ? "rv" : types[Math.floor(rng() * types.length)];
      const has_electric = t === "rv" ? rng() < 0.9 : rng() < 0.3;
      const has_water = t === "rv" && rng() < 0.55;
      const has_sewer = t === "rv" && rng() < 0.3;
      const is_pull_through = t === "rv" && rng() < 0.35;
      const is_waterfront = rng() < 0.18;
      const is_accessible = rng() < 0.1;
      const is_pet_friendly = rng() < 0.85;
      const amenities: string[] = [];
      if (has_electric) amenities.push(rng() < 0.5 ? "electric_30a" : "electric_15a");
      if (has_water) amenities.push("water");
      if (has_sewer) amenities.push("sewer");
      if (is_pull_through) amenities.push("pull_through");
      if (is_waterfront) amenities.push("waterfront", "lake_swim");
      if (is_accessible) amenities.push("accessible");
      if (rng() < 0.95) amenities.push("fire_pit");
      if (rng() < 0.95) amenities.push("picnic_table");
      if (rng() < 0.7) amenities.push("flush_toilets");
      if (rng() < 0.5) amenities.push("showers");
      sites.push({
        id: `s_${cg.id}_${i}`,
        campground_id: cg.id,
        vendor_site_id: String(100 + i),
        name: t === "cabin" ? `Cabin ${i}` : `${i}`,
        site_type: t,
        max_party_size: 4 + Math.floor(rng() * 3) * 2,
        max_equipment_length_ft: t === "rv" ? 24 + Math.floor(rng() * 5) * 4 : null,
        has_electric,
        has_water,
        has_sewer,
        is_pull_through,
        is_accessible,
        is_pet_friendly,
        is_waterfront,
        amenities,
      });
    }
  }
  return sites;
}

export const sites: Site[] = generateSites();

const AVAILABILITY_START = "2026-05-15";
const AVAILABILITY_END = "2026-10-15";
const ALL_NIGHTS = eachDate(AVAILABILITY_START, AVAILABILITY_END);

function generateAvailability(): AvailabilityRow[] {
  const rows: AvailabilityRow[] = [];
  // Stagger freshness across operators so the dashboard looks realistic
  const operatorFreshness: Record<string, number> = {
    ontario_parks: 4,
    parks_canada: 12,
    gtc_lprca: 6,
    gtc_grand: 8,
    gtc_trca: 3,
    gtc_saugeen: 9,
  };
  const now = Date.now();
  const parkById = new Map(parks.map((p) => [p.id, p]));
  const cgById = new Map(campgrounds.map((c) => [c.id, c]));

  for (const site of sites) {
    const cg = cgById.get(site.campground_id)!;
    const park = parkById.get(cg.park_id)!;
    const freshnessMin = operatorFreshness[park.operator_id] ?? 10;
    const rng = mulberry32(hashStr(site.id));
    const base = rng() < 0.35 ? 3500 : rng() < 0.7 ? 4800 : 6200;
    for (const night of ALL_NIGHTS) {
      const d = new Date(night + "T00:00:00Z");
      const dow = d.getUTCDay();
      const monthFactor = d.getUTCMonth() >= 5 && d.getUTCMonth() <= 7 ? 0.55 : 0.85;
      const weekendBoost = dow === 5 || dow === 6 ? -0.25 : 0;
      const threshold = monthFactor + weekendBoost;
      const r = rng();
      const status =
        r < threshold ? "available" : r < threshold + 0.25 ? "reserved" : r < threshold + 0.3 ? "closed" : "available";
      const checkedAt = new Date(now - (freshnessMin * 60 * 1000 + rng() * 4 * 60 * 1000));
      rows.push({
        site_id: site.id,
        night_date: night,
        status,
        price_cents: status === "closed" ? null : base + (dow === 5 || dow === 6 ? 500 : 0),
        last_checked_at: checkedAt.toISOString(),
      });
    }
  }
  return rows;
}

export const availability: AvailabilityRow[] = generateAvailability();

// Pre-indexed lookups
export const parkById = new Map(parks.map((p) => [p.id, p]));
export const campgroundById = new Map(campgrounds.map((c) => [c.id, c]));
export const operatorById = new Map(operators.map((o) => [o.id, o]));
export const siteById = new Map(sites.map((s) => [s.id, s]));
export const sitesByCampground = (() => {
  const m = new Map<string, Site[]>();
  for (const s of sites) {
    if (!m.has(s.campground_id)) m.set(s.campground_id, []);
    m.get(s.campground_id)!.push(s);
  }
  return m;
})();
export const campgroundsByPark = (() => {
  const m = new Map<string, Campground[]>();
  for (const c of campgrounds) {
    if (!m.has(c.park_id)) m.set(c.park_id, []);
    m.get(c.park_id)!.push(c);
  }
  return m;
})();
export const availabilityIndex = (() => {
  const m = new Map<string, Map<string, AvailabilityRow>>();
  for (const row of availability) {
    if (!m.has(row.site_id)) m.set(row.site_id, new Map());
    m.get(row.site_id)!.set(row.night_date, row);
  }
  return m;
})();
