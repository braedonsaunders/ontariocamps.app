/**
 * Hand-curated park coordinates.
 *
 * Why this file exists: the Camis /api/maps/root endpoint returns the geometry of pins
 * on the operator's branded map image (xCoordinate/yCoordinate are pixel offsets on that PNG),
 * not real-world lat/lng. Per spec §12, geo data accuracy mitigation is "Verify park lat/lng
 * by hand for top 50 parks; community correction form."
 *
 * Matching is case- and punctuation-insensitive substring match by default. RegExp
 * matchers handle aliases (e.g., "Algonquin - X" all map to Algonquin coords).
 *
 * Source for coords: official Ontario Parks / Parks Canada / Conservation Authority pages.
 * Where a park has multiple Camis "reservation locations" (e.g., Algonquin Achray, Brent,
 * Mew Lake), they all resolve to the same point because they are geographically the same
 * park; the operator just splits the reservation flow.
 */

export type ParkCoord = {
  match: string | RegExp;
  lat: number;
  lng: number;
  region: string;
  description?: string;
  heroImageUrl?: string;
};

/**
 * IMPORTANT: ordering matters. The first match wins, so put more-specific regexes
 * BEFORE looser substring matches that would otherwise swallow them.
 */
export const PARK_COORDS: ParkCoord[] = [
  // ─── Algonquin sub-areas (must come BEFORE plain "Algonquin") ──────────────
  { match: /Algonquin\s*-\s*Achray/i, lat: 45.864, lng: -77.711, region: "Central",
    description: "Achray on Grand Lake — Algonquin's eastern access, base for Barron Canyon paddling." },
  { match: /Algonquin\s*-\s*Basin Lake/i, lat: 45.731, lng: -78.404, region: "Central" },
  { match: /Algonquin\s*-\s*Brent/i, lat: 46.0, lng: -78.498, region: "Central",
    description: "Northern access at the meteor-impact-formed Cedar Lake — remote car-camping at the end of a long gravel road." },
  { match: /Algonquin\s*-\s*Canisbay/i, lat: 45.572, lng: -78.476, region: "Central" },
  { match: /Algonquin\s*-\s*East Beach/i, lat: 45.585, lng: -78.502, region: "Central" },
  { match: /Algonquin\s*-\s*Hwy 60/i, lat: 45.585, lng: -78.376, region: "Central",
    description: "The Highway 60 corridor — Algonquin's main drive-through with the visitor centre and most car-camping." },
  { match: /Algonquin\s*-\s*Kingscote/i, lat: 45.272, lng: -78.243, region: "Central" },
  { match: /Algonquin\s*-\s*Kiosk/i, lat: 46.014, lng: -78.882, region: "Central" },
  { match: /Algonquin\s*-\s*Lake of Two Rivers/i, lat: 45.575, lng: -78.487, region: "Central",
    description: "Largest of the Hwy 60 campgrounds, on Lake of Two Rivers' sandy north shore." },
  { match: /Algonquin\s*-\s*Mew Lake/i, lat: 45.581, lng: -78.502, region: "Central",
    description: "Easternmost of the Hwy 60 campgrounds. Year-round access; one of the few Algonquin sites with winter sites." },
  { match: /Algonquin\s*-\s*Pog Lake/i, lat: 45.567, lng: -78.470, region: "Central" },
  { match: /Algonquin\s*-\s*Rock Lake/i, lat: 45.526, lng: -78.367, region: "Central" },
  { match: /Algonquin\s*-\s*Shall Lake/i, lat: 45.286, lng: -78.038, region: "Central" },
  { match: /Algonquin\s*-\s*Tea Lake/i, lat: 45.55, lng: -78.601, region: "Central" },
  { match: /Algonquin\s*-\s*Tim River/i, lat: 45.793, lng: -78.917, region: "Central" },
  { match: /Algonquin\s*-\s*Whitefish/i, lat: 45.521, lng: -78.392, region: "Central" },
  { match: /Algonquin Backcountry/i, lat: 45.836, lng: -78.379, region: "Central",
    description: "Interior canoe routes across the park." },
  { match: "Algonquin", lat: 45.836, lng: -78.379, region: "Central",
    description: "Ontario's flagship park — 7,653 km² of lake-stitched canoe routes and Highway 60 frontcountry campgrounds." },

  // ─── Provincial Parks A–Z ─────────────────────────────────────────────────
  { match: "Arrow Lake", lat: 48.797, lng: -88.169, region: "Northern" },
  { match: "Arrowhead", lat: 45.388, lng: -79.221, region: "Central",
    description: "Year-round park near Huntsville with the famous winter skating trail." },
  { match: "Awenda", lat: 44.835, lng: -79.999, region: "Central" },
  { match: "Balsam Lake", lat: 44.611, lng: -78.842, region: "Central" },
  { match: "Bass Lake", lat: 44.654, lng: -79.493, region: "Central" },
  { match: "Batchawana Bay", lat: 46.929, lng: -84.563, region: "Northern" },
  { match: "Blue Lake", lat: 49.738, lng: -93.875, region: "Northwestern" },
  { match: "Bon Echo", lat: 44.892, lng: -77.211, region: "Southeastern",
    description: "Mazinaw Rock — a 1.5 km cliff rising 100 m from the lake." },
  { match: "Bonnechere", lat: 45.633, lng: -77.611, region: "Eastern" },
  { match: "Caliper Lake", lat: 49.052, lng: -93.972, region: "Northwestern" },
  { match: "Charleston Lake", lat: 44.512, lng: -76.022, region: "Southeastern" },
  { match: "Chutes", lat: 46.211, lng: -82.094, region: "Northeastern" },
  { match: "Craigleith", lat: 44.541, lng: -80.281, region: "Central" },
  { match: "Darlington", lat: 43.872, lng: -78.776, region: "Southeastern" },
  { match: "Driftwood", lat: 46.156, lng: -77.836, region: "Eastern" },
  { match: "Earl Rowe", lat: 44.156, lng: -79.901, region: "Central" },
  { match: "Emily", lat: 44.298, lng: -78.539, region: "Central" },
  { match: "Esker Lakes", lat: 48.272, lng: -79.929, region: "Northeastern" },
  { match: "Fairbank", lat: 46.461, lng: -81.404, region: "Northeastern" },
  { match: "Ferris", lat: 44.292, lng: -77.798, region: "Southeastern" },
  { match: "Finlayson Point", lat: 47.024, lng: -79.792, region: "Northeastern" },
  { match: "Fitzroy", lat: 45.475, lng: -76.215, region: "Eastern" },
  { match: "Forks of the Credit", lat: 43.811, lng: -79.991, region: "Central" },
  { match: "French River", lat: 46.106, lng: -80.546, region: "Central" },
  { match: "Frontenac", lat: 44.529, lng: -76.519, region: "Southeastern" },
  { match: "Fushimi Lake", lat: 49.834, lng: -83.928, region: "Northern" },
  { match: "Grundy Lake", lat: 45.928, lng: -80.527, region: "Northeastern" },
  { match: "Halfway Lake", lat: 46.866, lng: -81.61, region: "Northeastern" },
  { match: "Inverhuron", lat: 44.281, lng: -81.575, region: "Southwestern" },
  { match: "Ivanhoe Lake", lat: 48.115, lng: -82.622, region: "Northeastern" },
  { match: "Kakabeka Falls", lat: 48.398, lng: -89.624, region: "Northwestern" },
  { match: "Kap-Kig-Iwan", lat: 47.776, lng: -79.857, region: "Northeastern" },
  { match: "Kawartha Highlands", lat: 44.875, lng: -78.222, region: "Central" },
  { match: "Kettle Lakes", lat: 48.581, lng: -80.997, region: "Northeastern" },
  { match: "Killarney", lat: 46.013, lng: -81.401, region: "Northeastern",
    description: "White quartzite ridges of the La Cloche range over deep clear lakes." },
  { match: "Killbear", lat: 45.351, lng: -80.21, region: "Central" },
  { match: "Komoka", lat: 42.953, lng: -81.466, region: "Southwestern" },
  { match: /Lake on the Mountain/i, lat: 44.043, lng: -77.058, region: "Southeastern" },
  { match: /Lake St\.? Peter/i, lat: 45.310, lng: -78.027, region: "Central" },
  { match: "Lake Superior", lat: 47.706, lng: -84.875, region: "Northern" },
  { match: "Long Point", lat: 42.567, lng: -80.395, region: "Southwestern" },
  { match: /MacGregor( Point)?/i, lat: 44.745, lng: -81.232, region: "Southwestern" },
  { match: "MacLeod", lat: 49.741, lng: -86.991, region: "Northern" },
  { match: "Mara", lat: 44.514, lng: -79.281, region: "Central" },
  { match: /Mark S\.? Burnham/i, lat: 44.291, lng: -78.230, region: "Central" },
  { match: "Marten River", lat: 46.711, lng: -79.776, region: "Northeastern" },
  { match: "McRae Point", lat: 44.541, lng: -79.252, region: "Central" },
  { match: "Mikisew", lat: 45.806, lng: -79.555, region: "Central" },
  { match: "Misery Bay", lat: 45.770, lng: -82.711, region: "Northeastern" },
  { match: /^Missinaibi$/i, lat: 48.328, lng: -83.554, region: "Northern" },
  { match: /Missinaibi.*River/i, lat: 49.620, lng: -83.235, region: "Northern" },
  { match: "Mississagi", lat: 46.582, lng: -82.769, region: "Northeastern" },
  { match: "Mono Cliffs", lat: 44.115, lng: -80.058, region: "Central" },
  { match: "Murphys Point", lat: 44.781, lng: -76.241, region: "Eastern" },
  { match: "Nagagamisis", lat: 49.501, lng: -84.703, region: "Northern" },
  { match: "Neys", lat: 48.785, lng: -86.594, region: "Northern" },
  { match: "North Beach", lat: 43.972, lng: -77.518, region: "Southeastern" },
  { match: "Oastler Lake", lat: 45.276, lng: -79.97, region: "Central" },
  { match: "Ojibway", lat: 49.768, lng: -91.700, region: "Northwestern" },
  { match: "Ouimet Canyon", lat: 48.781, lng: -88.700, region: "Northwestern" },
  { match: /Oxtongue River|Ragged Falls/i, lat: 45.379, lng: -78.929, region: "Central" },
  { match: "Pakwash", lat: 50.741, lng: -93.198, region: "Northwestern" },
  { match: "Pancake Bay", lat: 46.962, lng: -84.717, region: "Northern" },
  { match: "Petroglyphs", lat: 44.601, lng: -78.005, region: "Central" },
  { match: /^Pinery$|The Pinery/i, lat: 43.247, lng: -81.831, region: "Southwestern",
    description: "10 km of Lake Huron sand beach backed by oak savanna and the Old Ausable Channel." },
  { match: "Point Farms", lat: 43.798, lng: -81.706, region: "Southwestern" },
  { match: "Port Burwell", lat: 42.652, lng: -80.825, region: "Southwestern" },
  { match: /Presqu['']ile/i, lat: 43.999, lng: -77.711, region: "Southeastern" },
  { match: "Quetico", lat: 48.589, lng: -91.621, region: "Northwestern" },
  { match: "Rainbow Falls", lat: 48.823, lng: -87.523, region: "Northern" },
  { match: /Ren[ée] Brunelle/i, lat: 49.654, lng: -82.155, region: "Northern" },
  { match: "Restoule", lat: 46.061, lng: -79.785, region: "Central" },
  { match: "Rideau River", lat: 44.892, lng: -75.667, region: "Eastern" },
  { match: "Rock Point", lat: 42.853, lng: -79.554, region: "Southwestern" },
  { match: "Rondeau", lat: 42.273, lng: -81.85, region: "Southwestern" },
  { match: "Rushing River", lat: 49.71, lng: -94.246, region: "Northwestern" },
  { match: "Samuel de Champlain", lat: 46.243, lng: -78.94, region: "Northeastern" },
  { match: "Sandbanks", lat: 43.913, lng: -77.241, region: "Southeastern",
    description: "The world's largest bay-mouth barrier dune formation." },
  { match: "Sandbar Lake", lat: 49.439, lng: -91.500, region: "Northwestern" },
  { match: "Sauble Falls", lat: 44.687, lng: -81.260, region: "Southwestern" },
  { match: "Selkirk", lat: 42.819, lng: -79.953, region: "Southwestern" },
  { match: "Sharbot Lake", lat: 44.770, lng: -76.694, region: "Southeastern" },
  { match: "Sibbald Point", lat: 44.302, lng: -79.328, region: "Central" },
  { match: "Silent Lake", lat: 44.918, lng: -78.066, region: "Central" },
  { match: "Silver Falls", lat: 48.469, lng: -89.601, region: "Northwestern" },
  { match: "Silver Lake", lat: 44.79, lng: -76.674, region: "Southeastern" },
  { match: "Sioux Narrows", lat: 49.408, lng: -94.097, region: "Northwestern" },
  { match: "Six Mile Lake", lat: 44.886, lng: -79.751, region: "Central" },
  { match: "Sleeping Giant", lat: 48.359, lng: -88.79, region: "Northwestern" },
  { match: /Spanish River|Biscotasi/i, lat: 46.892, lng: -82.067, region: "Northeastern" },
  // Conservation Authority parks — kept first so the more-specific CA names
  // win over loose substring matches like "Springwater" (the OP park is in
  // the Central region, the CA park is south-west).
  { match: "Fanshawe", lat: 43.040, lng: -81.184, region: "Southwestern" },
  { match: "Wildwood", lat: 43.221, lng: -80.973, region: "Southwestern" },
  { match: "Pittock", lat: 43.135, lng: -80.728, region: "Southwestern" },
  { match: "Falls Reserve", lat: 43.726, lng: -81.557, region: "Southwestern" },
  { match: /Springwater Conservation/i, lat: 42.681, lng: -80.964, region: "Southwestern" },
  { match: "Springwater", lat: 44.435, lng: -79.776, region: "Central" },
  { match: "Sturgeon Bay", lat: 45.077, lng: -80.013, region: "Central" },
  { match: "Temagami", lat: 47.013, lng: -80.043, region: "Northeastern" },
  { match: "The Massasauga", lat: 45.255, lng: -79.945, region: "Central" },
  { match: "Tidewater", lat: 51.276, lng: -80.628, region: "Northern" },
  { match: "Turkey Point", lat: 42.687, lng: -80.327, region: "Southwestern" },
  { match: "Voyageur", lat: 45.541, lng: -74.464, region: "Eastern" },
  { match: "Wabakimi", lat: 50.583, lng: -89.583, region: "Northwestern" },
  { match: "Wakami Lake", lat: 47.585, lng: -82.847, region: "Northern" },
  { match: "Wasaga Beach", lat: 44.518, lng: -80.011, region: "Central" },
  { match: "Wheatley", lat: 42.094, lng: -82.453, region: "Southwestern" },
  { match: "White Lake", lat: 48.766, lng: -85.638, region: "Northern" },
  { match: "Windy Lake", lat: 46.612, lng: -81.43, region: "Northeastern" },
  { match: "Woodland Caribou", lat: 51.114, lng: -94.628, region: "Northwestern" },

  // ─── Parks Canada — Ontario national parks / sites ────────────────────────
  // (Restrict to Ontario by listing only Ontario sites; non-Ontario PC parks
  //  return no match and get dropped during ingest.)
  { match: /Bruce Peninsula|Cyprus Lake/i, lat: 45.232, lng: -81.499, region: "Western",
    description: "Cliffs over Georgian Bay turquoise, the Grotto sea cave, northern Bruce Trail." },
  { match: "Pukaskwa", lat: 48.587, lng: -86.286, region: "Northern",
    description: "Wild Lake Superior coastline, only national park in Ontario protecting boreal forest." },
  { match: /Georgian Bay|Beausoleil|Cedar Spring|Christian Beach|DayTripper/i, lat: 44.879, lng: -79.864, region: "Central",
    description: "63 islands in Georgian Bay's UNESCO biosphere reserve." },
  { match: /Point Pelee/i, lat: 41.961, lng: -82.516, region: "Southwestern" },
  { match: /Thousand Islands|Mallorytown/i, lat: 44.418, lng: -75.847, region: "Southeastern" },
  { match: /^Rouge/i, lat: 43.806, lng: -79.165, region: "GTA" },
  { match: /Fathom Five/i, lat: 45.298, lng: -81.668, region: "Western" },
  { match: /Trent-?Severn/i, lat: 44.658, lng: -78.236, region: "Central" },
  { match: /Rideau Canal/i, lat: 44.985, lng: -76.111, region: "Eastern" },

  // ─── Conservation Authorities — Long Point Region ─────────────────────────
  { match: /Backus Heritage|Backus Conservation/i, lat: 42.74, lng: -80.519, region: "Southwestern" },
  { match: /Deer Creek/i, lat: 42.866, lng: -80.456, region: "Southwestern" },
  { match: /Haldimand( Conservation)?/i, lat: 42.951, lng: -80.005, region: "Southwestern" },
  { match: /^Norfolk( Conservation)?$/i, lat: 42.732, lng: -80.295, region: "Southwestern" },
  { match: /Waterford North/i, lat: 42.943, lng: -80.302, region: "Southwestern" },

  // ─── Conservation Authorities — St. Clair Region ──────────────────────────
  { match: /A\.?W\.?\s*Campbell/i, lat: 42.94, lng: -82.0, region: "Southwestern" },
  { match: /Lorne C\.?\s*Henderson/i, lat: 42.918, lng: -82.044, region: "Southwestern" },
  { match: /^Warwick( Conservation)?$/i, lat: 42.95, lng: -81.85, region: "Southwestern" },

  // ─── Conservation Authorities — Grand River ───────────────────────────────
  { match: /Byng Island/i, lat: 42.987, lng: -79.872, region: "Southwestern" },
  { match: /Brant Park|Brant Conservation/i, lat: 43.073, lng: -80.317, region: "Southwestern" },
  { match: /Pinehurst Lake/i, lat: 43.323, lng: -80.345, region: "Southwestern" },
  { match: /^Rockwood/i, lat: 43.616, lng: -80.143, region: "Southwestern" },
  { match: /Belwood Lake/i, lat: 43.788, lng: -80.388, region: "Southwestern" },
  { match: /Conestogo Lake/i, lat: 43.681, lng: -80.708, region: "Southwestern" },
  { match: /Elora Quarry/i, lat: 43.682, lng: -80.434, region: "Southwestern" },
  { match: /Elora Gorge/i, lat: 43.687, lng: -80.444, region: "Southwestern" },
  { match: /Guelph Lake/i, lat: 43.604, lng: -80.211, region: "Southwestern" },
  { match: /Laurel Creek/i, lat: 43.490, lng: -80.587, region: "Southwestern" },
  { match: /Shade['']s Mills|Shades Mills/i, lat: 43.350, lng: -80.296, region: "Southwestern" },

  // ─── Conservation Authorities — Saugeen Valley ────────────────────────────
  { match: /^Durham/i, lat: 44.176, lng: -80.819, region: "Western" },
  { match: /McBeath/i, lat: 44.106, lng: -81.054, region: "Western" },
  { match: /Saugeen Bluffs/i, lat: 44.388, lng: -81.230, region: "Western" },

  // ─── Conservation Authorities — TRCA ──────────────────────────────────────
  { match: /Indian Line/i, lat: 43.737, lng: -79.628, region: "GTA" },
  { match: /Albion Hills/i, lat: 43.928, lng: -79.84, region: "GTA" },
  { match: /Glen Haffy/i, lat: 43.927, lng: -79.972, region: "GTA" },

  // ─── Conservation Authorities — Otonabee Region ───────────────────────────
  { match: /Warsaw Caves/i, lat: 44.448, lng: -78.078, region: "Central" },

  // ─── Conservation Authorities — Niagara Peninsula ─────────────────────────
  { match: /Ball['']s Falls|Balls Falls/i, lat: 43.131, lng: -79.353, region: "Niagara" },
  { match: /Binbrook/i, lat: 43.122, lng: -79.831, region: "Niagara" },
  { match: /Long Beach( Conservation)?/i, lat: 42.875, lng: -79.464, region: "Niagara" },
];

const NORM_CACHE: Array<{ matcher: ParkCoord; literalLower: string | null }> = PARK_COORDS.map((c) => ({
  matcher: c,
  literalLower: typeof c.match === "string" ? c.match.toLowerCase().replace(/[^a-z0-9]/g, "") : null,
}));

export function resolveCoordinates(name: string | null | undefined): ParkCoord | null {
  if (!name) return null;
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const { matcher, literalLower } of NORM_CACHE) {
    if (matcher.match instanceof RegExp) {
      if (matcher.match.test(name)) return matcher;
    } else if (literalLower && norm.includes(literalLower)) {
      return matcher;
    }
  }
  return null;
}
