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
  /** Operator's per-site photos. Sourced from `/api/resourcelocation/resources`. */
  photos?: SitePhoto[];
  /** Operator's per-site description blurb. */
  description?: string | null;
  /** Operator-supplied minimum party size when present. */
  min_party_size?: number | null;
  /** Operator-supplied maximum stay length when present. */
  max_stay_nights?: number | null;
  /** Decoded and normalized operator rule metadata for this site. */
  rule_summary?: SiteRuleSummary | null;
  /** Raw CAMIS definedAttributes, persisted for future parsers and audits. */
  defined_attributes?: DecodedSiteAttribute[];
  /** Raw CAMIS allowedEquipment, persisted as source metadata. */
  allowed_equipment?: SourceEquipmentRule[];
};

export type SitePhoto = {
  url: string | null;
  avifUrl: string | null;
  aspectType: number;
};

export type SourceEquipmentRule = {
  equipmentCategoryId: number;
  subEquipmentCategoryId: number;
  label?: string | null;
};

export type DecodedSiteAttribute = {
  attributeDefinitionId: number;
  attributeId?: number | null;
  label: string;
  value: number | string | null;
  values: string[];
  rawValues: number[];
  isFilterable: boolean;
  order: number;
};

export type RuleHighlight = {
  label: string;
  tone?: "stone" | "amber" | "emerald" | "red" | "lake";
  category?: "restriction" | "setup" | "character" | "nearby" | "policy";
};

export type SiteRuleSummary = {
  highlights: RuleHighlight[];
  restrictions: string[];
  setup: {
    serviceType?: string | null;
    electricalService?: string | null;
    pullThrough?: boolean | null;
    doubleSite?: boolean | null;
    barrierFree?: boolean | null;
    firePitAvailable?: boolean | null;
    maxTents?: number | null;
    maxTrailers?: number | null;
    siteLengthM?: number | null;
    siteWidthM?: number | null;
    outletDistanceM?: number | null;
  };
  character: {
    shade?: string | null;
    privacy?: string | null;
    quality?: string | null;
    conditions: string[];
    groundCover: string[];
    padSlope?: string | null;
    obstructions: string[];
    firePitLocation?: string | null;
    firePit?: string | null;
  };
  nearby: string[];
  comfort: {
    showers?: string | null;
    toilet?: string | null;
    toiletType?: string | null;
    toiletDistanceM?: number | null;
    waterTap?: string | null;
    waterTapDistanceM?: number | null;
    showerDistanceM?: number | null;
    picnicTable?: boolean | null;
  };
  policies: {
    radioFree?: boolean;
    generatorFree?: boolean;
    noPets?: boolean;
    dogsAllowed?: boolean | null;
    tentsOnly?: boolean;
    noTents?: boolean;
    noVehicles?: boolean;
    walkIn?: boolean;
    alcoholPermitted?: boolean | null;
  };
  source: {
    vendor: Vendor;
    collectedAt?: string | null;
  };
};

export type RuleItem = {
  label: string;
  value: string;
  note?: string;
  tone?: "stone" | "amber" | "emerald" | "red" | "lake";
};

export type OperatorRuleSource = {
  operator_id: string;
  source_label: string;
  source_url: string;
  alerts_url: string | null;
  rules: RuleItem[];
  updated_at?: string | null;
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
  /** Non-site map decorations sourced from CAMIS (washrooms, water taps,
   *  text labels, etc.). See lib/types CampMapFeature. */
  features?: CampMapFeature[];
};

export type CampMapFeature =
  | {
      kind: "legend";
      x: number; y: number;
      r: number; g: number; b: number;
      legendItemType: number;
      iconType: number;
    }
  | {
      kind: "label";
      x: number; y: number;
      text: string | null;
      r?: number; g?: number; b?: number;
      fontSize?: number;
    }
  | {
      kind: "access";
      x: number; y: number;
      iconType?: number;
    };

export type AvailabilityStatus = "available" | "reserved" | "closed" | "unknown";

export type AvailabilityRow = {
  site_id: string;
  night_date: string;
  status: AvailabilityStatus;
  price_cents: number | null;
  last_checked_at: string;
};

export type SearchStayMode = "same_site" | "same_park" | "anywhere";
export type SearchSortMode = "distance" | "route" | "moves" | "freshness" | "name" | "availability" | "price";
export type SearchGroupMode = "park" | "campground" | "operator" | "none";

export type SearchResultSite = {
  id: string;
  name: string;
  site_type: SiteType;
  site_type_label?: string | null;
  thumbnail_url?: string | null;
  amenities: string[];
  rule_highlights?: RuleHighlight[];
};

export type SearchResultCampground = { id: string; name: string };

export type SearchResultPark = {
  slug: string;
  name: string;
  operator: string;
  operator_id: string;
  location: { lat: number; lng: number };
  distance_km?: number;
};

export type SearchResultAvailability = {
  nights: string[];
  price_cents: number | null;
  last_checked_at: string;
};

export type SearchResultSegment = {
  site: SearchResultSite;
  campground: SearchResultCampground;
  park: SearchResultPark;
  availability: SearchResultAvailability;
  booking_url: string;
};

export type SearchResult = SearchResultSegment & {
  stay?: {
    mode: SearchStayMode;
    label: string;
    move_count: number;
    park_count: number;
    segment_count: number;
    route_distance_km?: number;
    end_distance_km?: number;
    segments: SearchResultSegment[];
  };
};

export type SearchResultGroup = {
  key: string;
  label: string;
  detail: string;
  result_count: number;
  distance?: number;
  results: SearchResult[];
};

export type SearchResponse = {
  results: SearchResult[];
  total: number;
  freshness_p50_minutes: number;
  group_total?: number;
  groups?: SearchResultGroup[];
};

export type ReviewStatus = "pending" | "approved" | "rejected" | "flagged";

export type SiteReview = {
  id: string;
  site_id: string;
  author_handle: string;
  overall: number;
  privacy: number | null;
  cleanliness: number | null;
  noise: number | null;
  site_size: number | null;
  shade: number | null;
  title: string | null;
  body: string;
  visited_at: string | null;
  created_at: string;
};

export type ParkReview = {
  id: string;
  park_id: string;
  author_handle: string;
  overall: number;
  facilities: number | null;
  trails: number | null;
  beach: number | null;
  privacy: number | null;
  noise: number | null;
  title: string | null;
  body: string;
  visited_at: string | null;
  created_at: string;
};

export type SiteReviewAggregate = {
  review_count: number;
  rating_avg: number | null;
  rating_privacy: number | null;
  rating_cleanliness: number | null;
  rating_noise: number | null;
  rating_site_size: number | null;
  rating_shade: number | null;
};

export type ParkReviewAggregate = {
  review_count: number;
  rating_avg: number | null;
  rating_facilities: number | null;
  rating_trails: number | null;
  rating_beach: number | null;
  rating_privacy: number | null;
  rating_noise: number | null;
};

export type SiteReviewInput = {
  site_id: string;
  author_handle: string;
  overall: number;
  privacy?: number;
  cleanliness?: number;
  noise?: number;
  site_size?: number;
  shade?: number;
  title?: string;
  body: string;
  visited_at?: string;
};

export type ParkReviewInput = {
  park_id: string;
  author_handle: string;
  overall: number;
  facilities?: number;
  trails?: number;
  beach?: number;
  privacy?: number;
  noise?: number;
  title?: string;
  body: string;
  visited_at?: string;
};

export const SITE_RATING_ATTRS: { key: keyof Pick<SiteReview, "privacy" | "cleanliness" | "noise" | "site_size" | "shade">; label: string }[] = [
  { key: "privacy", label: "Privacy" },
  { key: "cleanliness", label: "Cleanliness" },
  { key: "noise", label: "Quietness" },
  { key: "site_size", label: "Site size" },
  { key: "shade", label: "Shade" },
];

export const PARK_RATING_ATTRS: { key: keyof Pick<ParkReview, "facilities" | "trails" | "beach" | "privacy" | "noise">; label: string }[] = [
  { key: "facilities", label: "Facilities" },
  { key: "trails", label: "Trails" },
  { key: "beach", label: "Beach / Water" },
  { key: "privacy", label: "Privacy" },
  { key: "noise", label: "Quietness" },
];

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
