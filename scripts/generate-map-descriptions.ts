/**
 * Generate research-backed descriptions for every park:
 * - parks.ai_description: compact 3-4 sentence copy for map popups.
 * - parks.ai_long_description: longer copy for the full park page.
 *
 * The raw operator text in parks.description is intentionally preserved.
 *
 * Preview:
 *   npx tsx scripts/generate-map-descriptions.ts
 *
 * Apply to the connected Supabase DB:
 *   npx tsx scripts/generate-map-descriptions.ts --apply
 */

import fs from "node:fs";
import path from "node:path";
import { sqlDirect } from "../lib/db/client";

type ParkRow = {
  id: string;
  name: string;
  operator_id: string;
  operator: string;
  region: string | null;
  description: string | null;
  vendor_url: string | null;
  total_sites: number;
};

type Source = {
  label: string;
  url: string;
};

const REGION_LABELS: Record<string, string> = {
  Central: "central Ontario",
  Eastern: "eastern Ontario",
  GTA: "the Greater Toronto Area",
  Niagara: "the Niagara region",
  Northeastern: "northeastern Ontario",
  Northern: "northern Ontario",
  Northwestern: "northwestern Ontario",
  Southeastern: "southeastern Ontario",
  Southwestern: "southwestern Ontario",
  Western: "western Ontario",
};

const OPERATOR_SOURCE_URLS: Record<string, Source> = {
  gtc_catfish: { label: "Catfish Creek Conservation Authority", url: "https://catfishcreek.ca/" },
  gtc_grca: { label: "Grand River Conservation Authority", url: "https://www.grandriver.ca/" },
  gtc_hca: { label: "Hamilton Conservation Authority", url: "https://conservationhamilton.ca/" },
  gtc_lprca: { label: "Long Point Region Conservation Authority", url: "https://www.lprca.on.ca/" },
  gtc_maitland: { label: "Maitland Valley Conservation Authority", url: "https://www.mvca.on.ca/" },
  gtc_npca: { label: "Niagara Peninsula Conservation Authority", url: "https://npca.ca/" },
  gtc_otonabee: { label: "Otonabee Conservation", url: "https://www.otonabeeconservation.com/" },
  gtc_stclair: { label: "St. Clair Region Conservation Authority", url: "https://www.scrca.on.ca/" },
  gtc_trca: { label: "Toronto and Region Conservation Authority", url: "https://trca.ca/" },
  gtc_upperthames: { label: "Upper Thames River Conservation Authority", url: "https://thamesriver.on.ca/" },
  ontario_parks: { label: "Ontario Parks", url: "https://www.ontarioparks.ca/" },
  parks_canada: { label: "Parks Canada", url: "https://parks.canada.ca/" },
};

const FEATURE_FACTS: Array<[RegExp, string, string]> = [
  [/Algonquin - Achray|Sand Lake/i, "It puts you on Algonquin's quieter eastern side, close to Grand Lake and the Barron Canyon country.", "quiet lakes, canoe routes, and classic Algonquin forest"],
  [/Algonquin - Basin Lake/i, "This access point serves a quieter Algonquin setting where the appeal is smaller-scale lake country rather than the busy Highway 60 corridor.", "a quieter Algonquin base with forest and water close by"],
  [/Algonquin - Brent/i, "Brent is Algonquin's remote northern access on Cedar Lake, a long-road approach that rewards campers with a wilder feel.", "remote Algonquin scenery and a less crowded arrival"],
  [/Algonquin - Canisbay/i, "Canisbay Lake sits on the Highway 60 side of Algonquin, with a strong balance of frontcountry camping and easy park access.", "Algonquin lakes, trails, and a practical campground base"],
  [/Algonquin - East Beach/i, "East Beach is part of the Highway 60 Algonquin experience, useful when you want the park's main corridor without being far from water.", "beach time and quick access to Algonquin's central corridor"],
  [/Algonquin - Hwy 60/i, "The Highway 60 corridor is Algonquin's main frontcountry spine, with visitor facilities, trailheads, lakes, and campgrounds within easier reach.", "the most convenient version of the Algonquin frontcountry"],
  [/Algonquin - Kingscote/i, "Kingscote is a southern Algonquin access with a quieter, more tucked-away feel than the main corridor.", "a lower-key Algonquin entry point with forest and lake country nearby"],
  [/Algonquin - Kiosk/i, "Kiosk is one of Algonquin's northern gateways, set up for campers who want a more remote park approach.", "northern Algonquin water, forest, and breathing room"],
  [/Algonquin - Lake of Two Rivers/i, "Lake of Two Rivers is one of Algonquin's best-known Highway 60 campgrounds, prized for its central location and lakeside setting.", "a classic Algonquin base close to trails, water, and day-use stops"],
  [/Algonquin - Mew Lake/i, "Mew Lake is a central Algonquin campground with year-round appeal and a particularly useful location along Highway 60.", "easy Algonquin access with a strong shoulder-season feel"],
  [/Algonquin - Pog Lake|Kearney Lake/i, "Pog Lake and Kearney Lake keep you close to Algonquin's Highway 60 corridor while still feeling like a wooded lake escape.", "car camping with quick access to paddling, trails, and park services"],
  [/Algonquin - Rock Lake|Raccoon Lake/i, "Rock Lake is a scenic Algonquin access known for water, forest, and a strong starting point for day trips into the park.", "a lake-focused Algonquin stay with room to explore"],
  [/Algonquin - Shall Lake/i, "Shall Lake is an eastern Algonquin access that suits campers looking for a quieter route into the park's lake country.", "less crowded Algonquin water access and forest"],
  [/Algonquin - Tea Lake/i, "Tea Lake is a practical Highway 60-area base, especially if you want to stay close to Algonquin's central services and trailheads.", "a simple, well-placed Algonquin camping base"],
  [/Algonquin - Tim River/i, "Tim River is a western Algonquin access with a more remote paddling-oriented character.", "quiet water routes and a slower Algonquin pace"],
  [/Algonquin - Whitefish Lake/i, "Whitefish Lake keeps you in the Highway 60 orbit while offering a lake setting with a quieter campground feel.", "lake access with the convenience of central Algonquin nearby"],
  [/Algonquin Backcountry/i, "This is Algonquin's interior experience: canoe routes, portages, remote campsites, and a much deeper sense of distance.", "real backcountry travel inside Ontario's flagship park"],
  [/^Algonquin/i, "Ontario's flagship park is a lake-stitched wilderness of canoe routes, trails, moose habitat, and classic Canadian Shield scenery.", "big-water paddling, forest, wildlife, and iconic Ontario camping"],
  [/Arrowhead/i, "Arrowhead is a year-round Huntsville-area park known for forest trails, the Big East River, Stubbs Falls, and its winter skating trail.", "easy Muskoka access with four-season energy"],
  [/Awenda/i, "Awenda protects a Georgian Bay landscape of forest, beaches, dunes, and kettle lake terrain near the tip of the Penetanguishene peninsula.", "Georgian Bay beaches and forested camping"],
  [/Balsam Lake/i, "Balsam Lake sits in the Kawarthas on a Trent-Severn waterway lake, making it a popular family camping and beach destination.", "warm-weather lake time with a classic cottage-country feel"],
  [/Bass Lake/i, "Bass Lake is a compact Orillia-area park built around an accessible lake, beach, and relaxed family camping.", "easy swimming, short drives, and low-friction camping"],
  [/Batchawana Bay/i, "Batchawana Bay gives you a sandy Lake Superior shoreline in a setting that feels big, northern, and open.", "Superior sunsets, beach walks, and road-trip camping"],
  [/Blue Lake/i, "Blue Lake is known for clear northwestern Ontario water, a sandy beach, and a calm boreal setting.", "clear-water swimming and northern lake camping"],
  [/Bon Echo/i, "Bon Echo is famous for Mazinaw Rock, the tall cliff on Mazinaw Lake with Indigenous pictographs and dramatic water views.", "cliff scenery, paddling, swimming, and a memorable lake backdrop"],
  [/Bonnechere/i, "Bonnechere mixes a sandy beach, river scenery, and forested camping near the Ottawa Valley.", "a gentler family camping base with water close by"],
  [/Caliper Lake/i, "Caliper Lake is a quieter northwestern Ontario park centred on a clean lake, forest, and simple camping.", "a relaxed lake stay away from busier corridors"],
  [/Charleston Lake/i, "Charleston Lake protects a rugged Frontenac Arch landscape of granite, forest, islands, and clear water.", "boating, paddling, hiking, and Canadian Shield scenery"],
  [/Chutes/i, "Chutes is built around the Aux Sables River and the Seven Sisters rapids, giving the campground a strong moving-water identity.", "river views, short hikes, and a scenic northern stop"],
  [/Craigleith/i, "Craigleith sits directly on Georgian Bay, with flat shale shoreline and big-water views near Blue Mountain.", "a compact waterfront base with easy access to Collingwood-area exploring"],
  [/Darlington/i, "Darlington is a Lake Ontario park east of Toronto with shoreline, beach, and marsh habitat close to urban routes.", "a quick lakefront escape without driving deep into cottage country"],
  [/Driftwood/i, "Driftwood sits on the Ottawa River, giving campers broad river views and a peaceful eastern Ontario shoreline setting.", "riverfront camping, paddling, and slower evenings by the water"],
  [/Earl Rowe/i, "Earl Rowe is a practical family park near Alliston with reservoir scenery, trails, and easy southern Ontario access.", "a simple weekend base close to the GTA and Simcoe County"],
  [/Emily/i, "Emily sits on the Pigeon River in the Kawarthas, which makes it useful for boating, fishing, and low-key family camping.", "river access and relaxed cottage-country camping"],
  [/Esker Lakes/i, "Esker Lakes protects kettle lakes and boreal forest near Kirkland Lake, with a quieter northern character.", "small lakes, forest trails, and a slower northern rhythm"],
  [/Fairbank/i, "Fairbank is centred on a spring-fed lake northwest of Sudbury, known for clear water and a compact campground feel.", "swimming, simple lake camping, and northern quiet"],
  [/Ferris/i, "Ferris sits near Campbellford and the Trent River, with trails and access to the Ranney Gorge suspension bridge nearby.", "river-valley scenery and an easy base for Trent Hills exploring"],
  [/Finlayson Point/i, "Finlayson Point is a Temagami-area base on Lake Temagami, a gateway to deep northern canoe country.", "big-lake scenery, paddling, and northern road-trip camping"],
  [/Fitzroy/i, "Fitzroy sits by the Ottawa and Carp rivers northwest of Ottawa, mixing beach time, mature forest, and easy city access.", "a convenient river-and-forest campground near the capital region"],
  [/Forks of the Credit/i, "Forks of the Credit is known for Credit River valley scenery, hiking trails, and the dramatic Niagara Escarpment landscape.", "a scenic day-use stop with strong trail appeal"],
  [/French River/i, "French River follows one of Canada's historic canoe routes, with rocky channels, pine shorelines, and a deep paddling legacy.", "heritage water routes and rugged river scenery"],
  [/Frontenac/i, "Frontenac is a backcountry-focused park of lakes, forest, and hiking loops in southeastern Ontario.", "quiet paddling, backpacking, and campsite solitude"],
  [/Fushimi Lake/i, "Fushimi Lake is a northern park with boreal forest, lake access, and a peaceful campground atmosphere.", "fishing, paddling, and unhurried northern camping"],
  [/Grundy Lake/i, "Grundy Lake combines Canadian Shield rock, clear lakes, beaches, and forested campsites south of Sudbury.", "classic Shield camping with family-friendly water access"],
  [/Halfway Lake/i, "Halfway Lake is a northern Ontario park with forest, water, and a quieter camping feel north of Sudbury.", "lake swimming, paddling, and a calmer northern base"],
  [/Inverhuron/i, "Inverhuron sits on Lake Huron, where beach days and west-facing sunset views are the main draw.", "lakefront camping with easy sunset payoff"],
  [/Ivanhoe Lake/i, "Ivanhoe Lake is a northern park with a sandy beach, warm lake setting, and a relaxed campground character.", "swimming, fishing, and a simple northern lake escape"],
  [/Kakabeka Falls/i, "Kakabeka Falls is anchored by one of Ontario's most impressive waterfalls, often called the Niagara of the North.", "dramatic falls, boardwalk views, and Thunder Bay-area camping"],
  [/Kap-Kig-Iwan/i, "Kap-Kig-Iwan protects Englehart River gorge scenery, waterfalls, and northern forest in a compact park setting.", "short hikes, moving water, and a quiet northern stop"],
  [/Kawartha Highlands/i, "Kawartha Highlands is a large canoe-country park with backcountry campsites spread across lakes and portages.", "paddling-focused camping without going all the way north"],
  [/Kettle Lakes/i, "Kettle Lakes is named for its glacial kettle lakes and sits in jack pine and boreal forest country near Timmins.", "small-lake camping and a distinct northern landscape"],
  [/Killarney/i, "Killarney is famous for the white quartzite ridges of the La Cloche range, clear lakes, and some of Ontario's best hiking.", "dramatic Shield scenery, paddling, and trail days"],
  [/Killbear/i, "Killbear is a Georgian Bay classic with rocky shoreline, windswept pines, beaches, and island-dotted views.", "big-water swimming, sunsets, and iconic Georgian Bay camping"],
  [/Komoka/i, "Komoka protects wooded Thames River valley terrain west of London, with trails and ravine scenery as the focus.", "a trail-first nature break close to the city"],
  [/Lake on the Mountain/i, "Lake on the Mountain is known for its unusual lake perched high above the Bay of Quinte.", "a scenic stop with one of Prince Edward County's strangest natural views"],
  [/Lake St\.? Peter/i, "Lake St. Peter is a smaller park in Hastings Highlands with a sandy beach and quiet lake setting.", "low-key swimming, paddling, and family camping"],
  [/Lake Superior/i, "Lake Superior Provincial Park protects a wild stretch of Superior coastline, inland lakes, forest, and ancient pictograph sites.", "big northern shoreline, serious scenery, and rugged camping"],
  [/^Long Point$/i, "Long Point sits on Lake Erie's long sandspit, a globally important birding area with beach and marsh landscapes.", "beach camping, birdlife, and a distinctive Lake Erie setting"],
  [/MacGregor Point/i, "MacGregor Point protects Lake Huron shoreline, wetlands, forest, and year-round trails near Port Elgin.", "sunsets, shoreline walks, and flexible four-season camping"],
  [/MacLeod/i, "MacLeod is a northern park on Kenogamisis Lake, useful for campers who want a quiet base near Geraldton.", "lake access, forest, and a relaxed northern stopover"],
  [/^Mara$/i, "Mara is a compact Lake Simcoe-area park with beach access and easy drives from Orillia and cottage country routes.", "simple beach time and convenient family camping"],
  [/Mark S\.? Burnham/i, "Mark S. Burnham protects a rare old-growth-style woodlot near Peterborough, with short trails under mature hardwoods.", "a quick forest walk and calm nature stop"],
  [/Marten River/i, "Marten River sits on a historic northern travel route with forest, water, and a quieter campground feel.", "paddling, fishing, and a practical northbound camping stop"],
  [/McRae Point/i, "McRae Point is a Lake Simcoe park near Orillia, centred on waterfront camping, swimming, and boating.", "easy lake access with a classic family campground feel"],
  [/Mikisew/i, "Mikisew is an Almaguin-area park on Eagle Lake, with beach, forest, and a quieter central-north setting.", "swimming, paddling, and relaxed lake camping"],
  [/Misery Bay/i, "Misery Bay protects rare alvar landscapes, shoreline, and quiet Manitoulin Island scenery.", "limestone barrens, nature trails, and a very different Ontario landscape"],
  [/Missinaibi \(River\)|Missinaibi.*River/i, "The Missinaibi River is a nationally significant canoe route with remote campsites and serious northern character.", "wilderness paddling and a true river journey"],
  [/^Missinaibi$/i, "Missinaibi is a remote northern park tied to big-water canoe travel, boreal forest, and quiet lake-country camping.", "remote paddling access and deep northern scenery"],
  [/Mississagi/i, "Mississagi is a rugged park north of Elliot Lake with clear lakes, hills, and strong hiking appeal.", "lookouts, paddling, and quieter Shield camping"],
  [/Mono Cliffs/i, "Mono Cliffs protects Niagara Escarpment cliffs, crevices, hardwood forest, and excellent day hiking.", "a dramatic trail stop close to the GTA"],
  [/Murphys Point/i, "Murphys Point sits in the Rideau Lakes area, with forest, shoreline, and historic mica-mine stories.", "hiking, paddling, and a softer eastern Ontario camping base"],
  [/Nagagamisis/i, "Nagagamisis is a northern lake park with boreal forest, broad water, and a quieter campground atmosphere.", "fishing, paddling, and spacious northern scenery"],
  [/Neys/i, "Neys is a Lake Superior park with a sweeping beach, rugged shoreline, and Second World War prisoner-of-war history.", "Superior beach walks, big horizons, and northern quiet"],
  [/North Beach/i, "North Beach is a Lake Ontario barrier-beach park in Prince Edward County with water on both sides of a narrow strip.", "sand, swimming, and a quick County beach hit"],
  [/Oastler Lake/i, "Oastler Lake is a Parry Sound-area campground on a small lake, close to Georgian Bay road-trip routes.", "a simple lake base near the 400 corridor"],
  [/Ojibway/i, "Ojibway is a northwestern Ontario park on Little Vermilion Lake, with a quiet forest-and-water setting.", "fishing, swimming, and relaxed northern camping"],
  [/Ouimet Canyon/i, "Ouimet Canyon is known for a deep gorge and sweeping lookout views north of Lake Superior.", "one of northwestern Ontario's most dramatic short scenic stops"],
  [/Oxtongue River|Ragged Falls/i, "Oxtongue River - Ragged Falls centres on a powerful waterfall just outside Algonquin's west side.", "a quick waterfall hike and an easy Algonquin-area add-on"],
  [/Pakwash/i, "Pakwash sits on a sandy beach in northwestern Ontario, with warm-weather lake time and a quieter campground feel.", "beach camping, fishing, and a calm northern stop"],
  [/Pancake Bay/i, "Pancake Bay is a Lake Superior park known for a long sandy beach and big-water views north of Sault Ste. Marie.", "Superior shoreline camping with excellent beach appeal"],
  [/Petroglyphs/i, "Petroglyphs protects Canada's largest known concentration of Indigenous rock carvings, along with forest and lake country.", "cultural history and quiet Shield scenery"],
  [/Pinery/i, "Pinery protects rare oak savanna, freshwater dunes, the Old Ausable Channel, and a long Lake Huron beach.", "beach days, sunsets, paddling, and one of Ontario's most distinctive ecosystems"],
  [/Point Farms/i, "Point Farms sits on a bluff above Lake Huron, with beach access and west-facing sunset views.", "a quieter Huron shore alternative with strong beach appeal"],
  [/Port Burwell/i, "Port Burwell offers Lake Erie beach access, open skies, and a relaxed campground near the north shore.", "warm beach days and easy southern Ontario camping"],
  [/Presqu'?ile/i, "Presqu'ile is a Lake Ontario peninsula park known for beaches, marsh, bird migration, and a historic lighthouse.", "birding, beach walks, and shoreline camping"],
  [/Quetico/i, "Quetico is one of Ontario's great wilderness canoe parks, with remote lakes, portages, and backcountry campsites.", "serious paddling and deep solitude"],
  [/Rainbow Falls/i, "Rainbow Falls combines Lake Superior-area shoreline with river falls and forested camping near Rossport.", "waterfall walks, big-lake scenery, and northern road-trip camping"],
  [/Ren[ée] Brunelle/i, "Rene Brunelle sits near Kapuskasing on Remi Lake, with northern forest, beach, and a practical campground base.", "a relaxed northern lake stay with family-friendly water access"],
  [/Restoule/i, "Restoule is known for forest, lakes, and cliff-top lookout trails overlooking Stormy Lake.", "hiking views, paddling, and quiet central Ontario camping"],
  [/Rideau River/i, "Rideau River is a family-friendly eastern Ontario park along the historic Rideau waterway south of Ottawa.", "river access and convenient camping near the capital region"],
  [/Rock Point/i, "Rock Point sits on Lake Erie's shore, with beach, exposed fossil beds, and birding habitat.", "shoreline walks, fossils, and warm southern Ontario camping"],
  [/Rondeau/i, "Rondeau is a Lake Erie peninsula park known for beach, forest, marsh, and major bird migration.", "birding, biking, beach time, and a softer coastal landscape"],
  [/Rushing River/i, "Rushing River is a Lake of the Woods-area park with granite shores, clear water, and island-dotted scenery.", "northwestern lake camping with strong paddling appeal"],
  [/Samuel de Champlain/i, "Samuel de Champlain sits on the historic Mattawa River route, with forested camping and a strong voyageur-history identity.", "river scenery, history, and family camping"],
  [/Sandbanks/i, "Sandbanks is famous for huge bay-mouth dunes, broad sandy beaches, and Lake Ontario swimming.", "beach-heavy camping and one of Ontario's signature summer landscapes"],
  [/Sandbar Lake/i, "Sandbar Lake offers a quieter northwestern Ontario lake setting with forest, beach, and fishing access.", "simple lake camping away from heavier traffic"],
  [/Sauble Falls/i, "Sauble Falls centres on a low waterfall and river setting near Lake Huron's Sauble Beach area.", "falls, river time, and easy access to a big beach region"],
  [/Selkirk/i, "Selkirk is a smaller Lake Erie-area park with fields, forest, and a relaxed campground atmosphere.", "a simple southern Ontario camping reset"],
  [/Sharbot Lake/i, "Sharbot Lake is a compact eastern Ontario park with two-lake access, swimming, and a convenient Highway 7 location.", "easy lake camping between Ottawa and the Kawarthas"],
  [/Sibbald Point/i, "Sibbald Point is a Lake Simcoe park with a large beach, family camping, and quick access from the GTA.", "straightforward beach camping without a long drive"],
  [/Silent Lake/i, "Silent Lake is a motor-free lake park with forested campsites, paddling, hiking, and a quieter atmosphere.", "calm water, dark nights, and no-motor lake time"],
  [/Silver Falls/i, "Silver Falls is a rugged northwestern Ontario park known for river scenery and access to more remote landscapes.", "moving water, forest, and a wilder day-use feel"],
  [/Silver Lake/i, "Silver Lake is a small eastern Ontario park with a beach, forest, and straightforward campground layout.", "quiet lake swimming and convenient camping"],
  [/Sioux Narrows/i, "Sioux Narrows sits on Lake of the Woods, giving campers island-dotted water views and classic northwestern Ontario scenery.", "fishing, boating, and big lake country"],
  [/Six Mile Lake/i, "Six Mile Lake is a Muskoka-area park on the Canadian Shield, with rocky shoreline and easy highway access.", "quick cottage-country camping with paddling and swimming close by"],
  [/Sleeping Giant/i, "Sleeping Giant protects the Sibley Peninsula on Lake Superior, with dramatic cliffs, long trails, and huge views.", "hiking, Superior shoreline, and one of Ontario's great lookout landscapes"],
  [/Spanish River|Biscotasi/i, "Spanish River and Biscotasi Lake are tied to classic wilderness canoe routes through northern Shield country.", "remote paddling, portages, and backcountry camping"],
  [/Springwater Conservation/i, "Springwater Conservation Area is a Catfish Creek watershed campground with forested sites and a quieter conservation-area feel.", "a smaller, practical camping escape in southwestern Ontario"],
  [/^Springwater$/i, "Springwater is a small Ontario Parks setting near Barrie, useful for a quick nature stop and simple outdoor time.", "easy access and a gentle park visit"],
  [/Sturgeon Bay/i, "Sturgeon Bay sits on Georgian Bay's eastern shore, with water access and a quieter central Ontario campground feel.", "boating, fishing, and relaxed bay-side camping"],
  [/Temagami/i, "The Temagami area is known for deep clear lakes, old-growth pine country, and a strong canoe-tripping identity.", "northern paddling culture and big-lake scenery"],
  [/Massasauga/i, "The Massasauga protects Georgian Bay coast, inland lakes, wetlands, and rugged backcountry campsites.", "paddling, islands, and a wilder Georgian Bay feel"],
  [/Tidewater/i, "Tidewater is a remote northern Ontario park near the Moose River and James Bay lowlands.", "far-north scenery and a very different Ontario camping context"],
  [/Turkey Point/i, "Turkey Point sits on Lake Erie's north shore, with beach access and a lively summer-town setting nearby.", "warm water, beach time, and easy Norfolk County exploring"],
  [/Voyageur/i, "Voyageur is an Ottawa River park near the Quebec border, with beaches, wetlands, and convenient highway access.", "river camping and an easy eastern Ontario stop"],
  [/Wabakimi/i, "Wabakimi is a vast wilderness park of boreal forest, remote lakes, and serious canoe routes.", "deep backcountry paddling and solitude"],
  [/Wakami Lake/i, "Wakami Lake is a northern park with forested campsites, big water, and a quiet lake-country setting.", "fishing, paddling, and unhurried northern camping"],
  [/Wheatley/i, "Wheatley sits near Lake Erie and Point Pelee country, with Carolinian forest, creeks, and a warm southern feel.", "birding, cycling, and easy Lake Erie exploring"],
  [/White Lake/i, "White Lake is a northern Ontario park with a large lake, sandy beach, and forested campground.", "clear-water swimming, fishing, and northern space"],
  [/Windy Lake/i, "Windy Lake is a Sudbury-area park with a broad beach, winter use, and easy access from northern highways.", "beach days, skiing season, and practical northern camping"],
  [/Woodland Caribou/i, "Woodland Caribou is a remote wilderness park known for canoe routes, boreal forest, and exceptional solitude.", "serious backcountry travel and dark-sky quiet"],
  [/Bruce Peninsula|Cyprus Lake/i, "Bruce Peninsula is known for Niagara Escarpment cliffs, clear Georgian Bay water, the Grotto, and access to the Bruce Trail.", "turquoise water, limestone cliffs, and one of Ontario's most sought-after camping areas"],
  [/Christian Beach/i, "Christian Beach is part of Georgian Bay Islands National Park, where the draw is island shoreline and cabin-style stays.", "Georgian Bay island scenery with a more contained overnight setup"],
  [/Fathom Five/i, "Fathom Five is centred on Tobermory's clear water, islands, shipwrecks, and flowerpot rock formations.", "boat trips, diving culture, and dramatic Georgian Bay scenery"],
  [/Point Pelee/i, "Point Pelee protects Canada's southernmost mainland point, famous for bird migration, marsh, beach, and Carolinian habitat.", "birding, boardwalks, and a landscape unlike most of Ontario"],
  [/Pukaskwa/i, "Pukaskwa protects wild Lake Superior shoreline, boreal forest, suspension bridges, and remote coastal hiking.", "rugged Superior scenery and a true northern national-park feel"],
  [/Rideau Canal/i, "The Rideau Canal is a historic waterway linking lakes, locks, towns, and paddling routes across eastern Ontario.", "heritage travel and waterside camping stops"],
  [/Thousand Islands/i, "Thousand Islands National Park protects granite islands and shoreline along the St. Lawrence River.", "island camping, paddling, boating, and big river views"],
  [/Trent-Severn/i, "The Trent-Severn Waterway links central Ontario lakes and historic locks across cottage country.", "waterside camping with boat-route history close by"],
  [/Backus/i, "Backus Heritage pairs conservation-area camping with heritage buildings, trails, and the Big Creek valley.", "a campground with history layered into the landscape"],
  [/Deer Creek/i, "Deer Creek is a Long Point Region conservation-area campground built around a small reservoir and quiet rural setting.", "a compact base for fishing, paddling, and easy camping"],
  [/Haldimand/i, "Haldimand offers a simple conservation-area camping stop in southern Ontario's Lake Erie watershed.", "low-key camping with a practical regional feel"],
  [/Norfolk/i, "Norfolk Conservation Area is a wooded Long Point Region campground close to Lake Erie and Norfolk County routes.", "quiet sites, shade, and easy access to the coast"],
  [/Waterford North/i, "Waterford North is a small conservation-area campground beside former quarry ponds and local trails.", "a compact, easygoing camping base near Waterford"],
  [/A\.?W\.? Campbell/i, "A.W. Campbell is a St. Clair Region conservation-area campground with a reservoir, trails, and a family-friendly layout.", "water access, shade, and relaxed watershed camping"],
  [/Lorne C\.? Henderson/i, "Lorne C. Henderson is a St. Clair Region conservation-area campground with wooded sites and a quiet rural character.", "a simple southwestern Ontario camping reset"],
  [/^Warwick/i, "Warwick Conservation Area is a St. Clair Region campground with reservoir scenery and an easygoing family feel.", "camping, fishing, and a small-park pace"],
  [/Brant/i, "Brant Conservation Area sits along the Grand River near Brantford, with camping, river access, and a very convenient location.", "Grand River camping close to town"],
  [/Byng Island/i, "Byng Island is a Grand River Conservation Area destination near Dunnville, known for camping and a large outdoor pool complex.", "family camping with easy Lake Erie-region access"],
  [/Conestogo Lake/i, "Conestogo Lake is a Grand River Conservation Area campground centred on reservoir shoreline and rural Waterloo-Wellington scenery.", "water views, boating, and a calm southwestern Ontario base"],
  [/Elora Gorge/i, "Elora Gorge is famous for limestone cliffs, Grand River scenery, tubing culture, and dramatic trail views.", "one of Ontario's most memorable conservation-area landscapes"],
  [/Guelph Lake/i, "Guelph Lake is a Grand River Conservation Area campground with reservoir beaches, trails, and quick access from Guelph.", "easy beach time and close-to-town camping"],
  [/Laurel Creek/i, "Laurel Creek sits on the edge of Waterloo, pairing conservation-area camping with reservoir, trails, and urban convenience.", "a quick nature base without leaving the region"],
  [/Pinehurst Lake/i, "Pinehurst Lake is a Grand River Conservation Area campground with a sandy beach, trails, and a relaxed lake setting.", "family camping with classic swimming-and-picnic appeal"],
  [/Rockwood/i, "Rockwood is known for limestone cliffs, glacial potholes, caves, and the Eramosa River reservoir.", "a scenic conservation-area stay with unusually dramatic geology"],
  [/Falls Reserve/i, "Falls Reserve sits on the Maitland River near Goderich, with river scenery, trails, and quiet conservation-area camping.", "riverbank camping and a slower Huron County pace"],
  [/Ball'?s Falls/i, "Ball's Falls is a Niagara Peninsula Conservation Area site with waterfall scenery, heritage buildings, and Twenty Mile Creek valley views.", "waterfalls, history, and a compact Niagara nature stop"],
  [/Binbrook/i, "Binbrook Conservation Area is built around Lake Niapenco, with swimming, paddling, fishing, and family camping.", "open water and easy Hamilton-Niagara access"],
  [/Chippawa Creek/i, "Chippawa Creek is a Niagara Peninsula Conservation Area campground with reservoir water, open lawns, and a relaxed family feel.", "camping, swimming, and paddling in a quieter Niagara setting"],
  [/Long Beach/i, "Long Beach Conservation Area gives campers Lake Erie shoreline access in the Niagara Peninsula Conservation Authority system.", "beach time, open water, and simple summer camping"],
  [/Fifty Point/i, "Fifty Point pairs Lake Ontario shoreline, marina facilities, and campground access on Hamilton's eastern waterfront.", "lakeside camping with marina energy and city convenience"],
  [/Valens Lake/i, "Valens Lake is a Hamilton Conservation Authority campground centred on a reservoir, forest, and trail network.", "wooded camping, paddling, and an easy Hamilton-region escape"],
  [/Beavermead/i, "Beavermead is an Otonabee Conservation campground in Peterborough, with Little Lake access and very convenient city proximity.", "waterside camping that stays close to restaurants, trails, and supplies"],
  [/Warsaw Caves/i, "Warsaw Caves is known for limestone caves, kettles, cliffs, and Indian River scenery.", "a compact adventure-focused conservation-area stay"],
  [/Albion Hills/i, "Albion Hills is a TRCA campground in the Caledon hills with trails, forest, and easy GTA access.", "quick camping, biking, and hiking without a long drive"],
  [/Indian Line/i, "Indian Line is a TRCA campground on the edge of Toronto, valued most for its convenience to the city and major routes.", "the most urban-friendly way to camp near Toronto"],
  [/Fanshawe/i, "Fanshawe Conservation Area wraps around Fanshawe Lake in London, with camping, trails, rowing, and shoreline views.", "city-close camping with a real lake-and-trail feel"],
  [/Pittock/i, "Pittock Conservation Area sits by Pittock Reservoir near Woodstock, offering campground access, water, and trail time.", "a straightforward conservation-area base in Oxford County"],
  [/Wildwood/i, "Wildwood Conservation Area is a wooded Upper Thames campground around Wildwood Reservoir near St. Marys.", "reservoir views, trails, and relaxed southwestern Ontario camping"],
];

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function regionText(region: string | null): string {
  return REGION_LABELS[region ?? ""] ?? "Ontario";
}

function operatorLabel(operatorId: string, operator: string): string {
  if (operatorId === "ontario_parks") return "Ontario Parks";
  if (operatorId === "parks_canada") return "Parks Canada";
  return operator;
}

function factForPark(name: string): { feature: string; experience: string } {
  for (const [pattern, feature, experience] of FEATURE_FACTS) {
    if (pattern.test(name)) return { feature, experience };
  }

  if (/lake/i.test(name)) {
    return {
      feature: "The lake setting is the main cue here, so the stay tends to revolve around water, shoreline, and a quieter campground rhythm where the operator offers it.",
      experience: "water access, calmer evenings, and classic Ontario lake-country camping",
    };
  }
  if (/falls|gorge|canyon|chutes/i.test(name)) {
    return {
      feature: "The landscape name points to the draw: moving water, exposed rock, and a more dramatic scenic setting than a standard campground.",
      experience: "short scenic walks, water views, and a campground with more visual punch",
    };
  }
  if (/river|canal|waterway|creek/i.test(name)) {
    return {
      feature: "The water-route setting gives this park its identity, with the surrounding landscape shaped by river travel, shoreline habitat, or watershed conservation.",
      experience: "a waterside base with paddling, fishing, or quiet shoreline time close by",
    };
  }
  if (/beach|bay|point|island/i.test(name)) {
    return {
      feature: "The shoreline setting is the key appeal, giving the park a more open, breezy feel than an inland campground.",
      experience: "beach time, sunsets, and easygoing shoreline camping",
    };
  }
  return {
    feature: "Its operator-listed setting makes it a practical camping base for exploring the surrounding region without straying far from maintained park facilities.",
    experience: "a straightforward Ontario camping trip with current availability easy to check",
  };
}

function siteScale(totalSites: number): string {
  if (totalSites >= 500) return "a large camping inventory";
  if (totalSites >= 200) return "a substantial camping inventory";
  if (totalSites >= 80) return "a manageable but meaningful camping inventory";
  if (totalSites > 0) return "a compact camping inventory";
  return "limited bookable inventory";
}

function accessScale(totalEntries: number): string {
  if (totalEntries >= 500) return "a large reservation inventory";
  if (totalEntries >= 200) return "a substantial reservation inventory";
  if (totalEntries >= 80) return "a manageable but meaningful reservation inventory";
  if (totalEntries > 0) return "a compact reservation inventory";
  return "limited reservation inventory";
}

function hasAccessInventory(park: ParkRow): boolean {
  return /parking/i.test(park.name);
}

function shortInventorySentence(park: ParkRow): string {
  if (park.total_sites <= 0) {
    return "Use it as a scenic/context pick first; bookable inventory may be seasonal, limited, or not overnight-focused.";
  }
  if (hasAccessInventory(park)) {
    return "Use the live signal for high-demand access dates, timed entry, and peak-day pressure before committing to the drive.";
  }
  if (park.total_sites >= 500) {
    return "There is plenty of inventory, but prime summer weekends can still move quickly.";
  }
  if (park.total_sites >= 200) {
    return "There is real choice here, though strong weekends and holidays are still worth checking early.";
  }
  if (park.total_sites >= 80) {
    return "The inventory is manageable, so a good date can tighten up faster than a giant park would.";
  }
  return "The inventory is compact, so the right site and date are worth checking before you build a trip around it.";
}

function longInventorySentence(park: ParkRow): string {
  if (park.total_sites <= 0) {
    return "Overnight inventory is limited or seasonal in the current index, so the park page is best used for context and for checking whether bookable options appear.";
  }
  if (hasAccessInventory(park)) {
    return `With ${park.total_sites.toLocaleString()} indexed entries, it has ${accessScale(park.total_sites)}, so flexibility can matter a lot during peak weekends, school-holiday windows, and high-demand day-use periods.`;
  }
  return `With ${park.total_sites.toLocaleString()} indexed sites, it has ${siteScale(park.total_sites)}, so date flexibility can matter a lot during peak weekends and school-holiday windows.`;
}

function bestForSentence(experience: string): string {
  if (/^(a|an)\s/i.test(experience)) return `Works well as ${experience}.`;
  if (/^one of\s/i.test(experience)) return `Go for ${experience}.`;
  return `Best for ${experience}.`;
}

function shortlistSentence(experience: string): string {
  const suffix = "especially if the setting itself matters as much as the available date.";
  if (/^(a|an)\s/i.test(experience)) return `Shortlist it as ${experience}, ${suffix}`;
  if (/^one of\s/i.test(experience)) return `Shortlist it for ${experience}, ${suffix}`;
  return `Shortlist it when you want ${experience}, ${suffix}`;
}

function sourcesForPark(park: ParkRow): Source[] {
  const sources: Source[] = [];
  const operatorSource = OPERATOR_SOURCE_URLS[park.operator_id];
  if (operatorSource) sources.push(operatorSource);
  if (park.operator_id === "ontario_parks") {
    const slug = park.name
      .replace(/^Algonquin\s*-\s*.*/i, "Algonquin")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "")
      .toLowerCase();
    if (slug) sources.push({ label: "Ontario Parks park page", url: `https://www.ontarioparks.ca/park/${slug}` });
  }
  if (park.vendor_url) sources.push({ label: "Operator booking page", url: park.vendor_url });
  return sources;
}

function generateDescription(park: ParkRow): string {
  const { feature, experience } = factForPark(park.name);
  const inventory = shortInventorySentence(park);
  const close = bestForSentence(experience);
  return [feature, close, inventory].join(" ");
}

function generateLongDescription(park: ParkRow): string {
  const { feature, experience } = factForPark(park.name);
  const setting = `${park.name} sits in ${regionText(park.region)} and is managed through ${operatorLabel(park.operator_id, park.operator)}.`;
  const fit = shortlistSentence(experience);
  const scale = longInventorySentence(park);
  const whyGo = "The best trip fit is usually decided by the landscape first: water, trails, beaches, cliffs, quiet forest, or simple proximity to the region you already want to explore.";
  const planning = park.operator_id === "parks_canada"
    ? "Because it is a Parks Canada location, final rules, permits, fees, and booking flow still belong on the official Parks Canada side."
    : park.operator_id === "ontario_parks"
      ? "Because it is part of the Ontario Parks system, the final booking rules, fees, alerts, and permit details still belong on the official Ontario Parks side."
      : `Because it is managed by ${park.operator}, local conservation-area rules, fees, check-in details, and seasonal conditions still belong with that authority.`;
  const close = "For planning, scan the setting and current availability here first, then confirm final details with the operator once the park feels like the right match.";
  return [feature, fit, setting, scale, whyGo, planning, close].join(" ");
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const sql = sqlDirect();

  await sql`
    ALTER TABLE parks ADD COLUMN IF NOT EXISTS ai_description TEXT
  `;
  await sql`
    ALTER TABLE parks ADD COLUMN IF NOT EXISTS ai_long_description TEXT
  `;
  await sql`
    ALTER TABLE parks ADD COLUMN IF NOT EXISTS ai_description_sources JSONB NOT NULL DEFAULT '[]'::jsonb
  `;

  const parks = await sql<ParkRow[]>`
    SELECT p.id, p.name, p.operator_id, o.name AS operator, p.region,
           p.description, p.vendor_url, p.total_sites::int AS total_sites
      FROM parks p
      JOIN operators o ON o.id = p.operator_id
     ORDER BY o.name, p.name
  `;

  const generated = parks.map((park) => ({
    ...park,
    ai_description: generateDescription(park),
    ai_long_description: generateLongDescription(park),
    ai_description_sources: sourcesForPark(park),
    raw_description: normalize(park.description),
  }));

  if (!apply) {
    console.log(`Previewing ${generated.length} generated map descriptions. Re-run with --apply to write them.`);
    console.table(
      generated.slice(0, 20).map((park) => ({
        id: park.id,
        name: park.name,
        operator: park.operator,
        short: park.ai_description,
        long: park.ai_long_description.slice(0, 180) + "…",
      })),
    );
    await sql.end();
    return;
  }

  for (const park of generated) {
    await sql`
      UPDATE parks
         SET ai_description = ${park.ai_description},
             ai_long_description = ${park.ai_long_description},
             ai_description_sources = ${sql.json(park.ai_description_sources)}
       WHERE id = ${park.id}
    `;
  }

  const coverage = await sql<Array<{
    total: number;
    with_ai_description: number;
    with_ai_long_description: number;
  }>>`
    SELECT count(*)::int AS total,
           count(ai_description)::int AS with_ai_description,
           count(ai_long_description)::int AS with_ai_long_description
      FROM parks
  `;
  console.log(
    `Wrote ${coverage[0]?.with_ai_description ?? 0}/${coverage[0]?.total ?? 0} short and ` +
      `${coverage[0]?.with_ai_long_description ?? 0}/${coverage[0]?.total ?? 0} long park AI descriptions.`,
  );
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
