import { sql } from "@/lib/db/client";
import { allowedEquipmentSupportsLength } from "@/lib/equipment-normalization";
import { runSearch, type SearchParams } from "@/lib/search";
import type { SearchResult, SearchSortMode, SearchStayMode } from "@/lib/types";
import { eachDate } from "@/lib/utils";

type Scenario = {
  name: string;
  params: SearchParams;
  expectEmpty?: boolean;
};

type SiteFact = {
  id: string;
  site_type: string;
  site_type_label: string | null;
  max_party_size: number;
  max_equipment_length_ft: number | null;
  amenities: string[];
  allowed_equipment: unknown;
  rule_summary: unknown;
  operator_id: string;
  park_slug: string;
};

type AvailabilityFact = {
  site_id: string;
  night_date: string;
  status: string;
};

const LOCATIONS = {
  toronto: { lat: 43.6532, lng: -79.3832, radius_km: 180 },
  ottawa: { lat: 45.4215, lng: -75.6972, radius_km: 220 },
} satisfies Record<string, Pick<SearchParams, "lat" | "lng" | "radius_km">>;

const DATE_WINDOWS = {
  fixed3: { start_date: "2026-06-12", end_date: "2026-06-15" },
  flexible2: { start_date: "2026-07-01", end_date: "2026-07-06", flexible: true, min_nights: 2 },
} satisfies Record<string, Pick<SearchParams, "start_date" | "end_date" | "flexible" | "min_nights">>;

const EQUIPMENT = {
  any: {},
  tent: { equipment: "tent", site_types: ["tent", "rv", "backcountry"] },
  rv32: { equipment: "rv", site_types: ["rv"], equipment_length_ft: 32 },
  roofed: { site_types: ["cabin", "yurt"] },
} satisfies Record<string, Pick<SearchParams, "equipment" | "site_types" | "equipment_length_ft">>;

const SORTS: SearchSortMode[] = ["distance", "route", "moves", "availability", "freshness", "name", "price"];
const STAY_MODES: SearchStayMode[] = ["same_site", "same_park", "anywhere"];
const RESULT_LIMIT = Number(process.env.SEARCH_QA_RESULT_LIMIT ?? 16);
const MAX_SCENARIOS = process.env.SEARCH_QA_MAX_SCENARIOS ? Number(process.env.SEARCH_QA_MAX_SCENARIOS) : null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sorted(values: string[]) {
  return [...values].sort();
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function requestedNights(params: SearchParams) {
  if (!params.start_date || !params.end_date) return null;
  const nights = eachDate(params.start_date, params.end_date);
  return nights.length > 0 ? nights : [];
}

function metric(result: SearchResult, sort: SearchSortMode) {
  if (sort === "distance") return result.park.distance_km ?? Number.POSITIVE_INFINITY;
  if (sort === "route") return result.stay?.route_distance_km ?? result.park.distance_km ?? Number.POSITIVE_INFINITY;
  if (sort === "moves") return result.stay?.move_count ?? 0;
  if (sort === "availability") return -result.availability.nights.length;
  if (sort === "freshness") return -new Date(result.availability.last_checked_at).getTime();
  if (sort === "price") return result.availability.price_cents ?? 0;
  return result.park.name.toLowerCase();
}

function compareMetrics(a: SearchResult, b: SearchResult, sort: SearchSortMode) {
  const av = metric(a, sort);
  const bv = metric(b, sort);
  if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv);
  return Number(av) - Number(bv);
}

function allSegments(result: SearchResult) {
  return result.stay?.segments ?? [result];
}

function ruleSiteLengthFt(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const setup = (raw as { setup?: { siteLengthM?: unknown } }).setup;
  const metres = setup?.siteLengthM;
  return typeof metres === "number" && Number.isFinite(metres) ? Math.round(metres * 3.28084) : null;
}

function scenarioList(): Scenario[] {
  const scenarios: Scenario[] = [];

  for (const [locationName, location] of Object.entries(LOCATIONS)) {
    for (const [dateName, dates] of Object.entries(DATE_WINDOWS)) {
      for (const stay_mode of STAY_MODES) {
        for (const [equipmentName, equipment] of Object.entries(EQUIPMENT)) {
          scenarios.push({
            name: `${locationName} / ${dateName} / ${stay_mode} / ${equipmentName}`,
            params: {
              ...location,
              ...dates,
              ...equipment,
              stay_mode,
              party_size: 2,
              sort: stay_mode === "anywhere" ? "route" : "distance",
              limit: RESULT_LIMIT,
            },
          });
        }
      }
    }
  }

  scenarios.push(
    {
      name: "same-site without dates near Toronto",
      params: { ...LOCATIONS.toronto, stay_mode: "same_site", party_size: 2, limit: RESULT_LIMIT },
    },
    {
      name: "park filter narrows to Darlington",
      params: {
        ...LOCATIONS.toronto,
        start_date: "2026-06-12",
        end_date: "2026-06-15",
        stay_mode: "same_site",
        park_slugs: ["darlington-2147483622"],
        limit: RESULT_LIMIT,
      },
    },
    {
      name: "same-park route requires dates",
      params: { ...LOCATIONS.toronto, stay_mode: "same_park", party_size: 2, limit: RESULT_LIMIT },
      expectEmpty: true,
    },
    {
      name: "nightly route requires dates",
      params: { ...LOCATIONS.toronto, stay_mode: "anywhere", party_size: 2, limit: RESULT_LIMIT },
      expectEmpty: true,
    },
    {
      name: "invalid date range returns no zero-night cards",
      params: { ...LOCATIONS.toronto, start_date: "2026-06-15", end_date: "2026-06-12", stay_mode: "same_site", limit: RESULT_LIMIT },
      expectEmpty: true,
    },
    {
      name: "same-park one-night route cannot move",
      params: { ...LOCATIONS.toronto, start_date: "2026-06-12", end_date: "2026-06-13", stay_mode: "same_park", limit: RESULT_LIMIT },
      expectEmpty: true,
    },
    {
      name: "nightly one-night route cannot move",
      params: { ...LOCATIONS.toronto, start_date: "2026-06-12", end_date: "2026-06-13", stay_mode: "anywhere", limit: RESULT_LIMIT },
      expectEmpty: true,
    },
    {
      name: "same-park four-night route changes every night",
      params: { ...LOCATIONS.toronto, start_date: "2026-06-12", end_date: "2026-06-16", stay_mode: "same_park", limit: RESULT_LIMIT },
    },
    {
      name: "nightly four-night route changes sites and parks",
      params: { ...LOCATIONS.toronto, start_date: "2026-06-12", end_date: "2026-06-16", stay_mode: "anywhere", sort: "route", limit: RESULT_LIMIT },
    },
  );

  for (const sort of SORTS) {
    scenarios.push({
      name: `sort ${sort} / fixed Toronto same-site`,
      params: {
        ...LOCATIONS.toronto,
        ...DATE_WINDOWS.fixed3,
        stay_mode: "same_site",
        party_size: 2,
        sort,
        limit: RESULT_LIMIT,
      },
    });
  }

  scenarios.push(
    {
      name: "fire-pit amenity filter",
      params: {
        ...LOCATIONS.toronto,
        ...DATE_WINDOWS.fixed3,
        stay_mode: "same_site",
        party_size: 2,
        amenities: ["fire_pit"],
        limit: RESULT_LIMIT,
      },
    },
    {
      name: "30A electric RV filter",
      params: {
        ...LOCATIONS.toronto,
        ...DATE_WINDOWS.fixed3,
        stay_mode: "same_site",
        party_size: 2,
        site_types: ["rv"],
        amenities: ["electric_30a"],
        equipment_length_ft: 32,
        limit: RESULT_LIMIT,
      },
    },
    {
      name: "Ontario Parks operator filter",
      params: {
        ...LOCATIONS.toronto,
        ...DATE_WINDOWS.fixed3,
        stay_mode: "same_site",
        party_size: 2,
        operators: ["ontario_parks"],
        limit: RESULT_LIMIT,
      },
    },
    {
      name: "Parks Canada operator filter",
      params: {
        ...LOCATIONS.ottawa,
        ...DATE_WINDOWS.fixed3,
        stay_mode: "same_site",
        party_size: 2,
        operators: ["parks_canada"],
        limit: RESULT_LIMIT,
      },
    },
    {
      name: "nightly route with an endpoint",
      params: {
        ...LOCATIONS.toronto,
        ...DATE_WINDOWS.fixed3,
        end_lat: 44.2312,
        end_lng: -76.486,
        stay_mode: "anywhere",
        party_size: 2,
        sort: "route",
        limit: RESULT_LIMIT,
      },
    },
  );

  return MAX_SCENARIOS ? scenarios.slice(0, MAX_SCENARIOS) : scenarios;
}

async function validateAgainstDatabase(scenario: Scenario, results: SearchResult[]) {
  const db = sql();
  const segments = results.flatMap(allSegments);
  const siteIds = unique(segments.map((segment) => segment.site.id));
  const nights = unique(segments.flatMap((segment) => segment.availability.nights));
  if (siteIds.length === 0 || nights.length === 0) return;

  const siteRows = await db<SiteFact[]>`
    SELECT
      s.id,
      s.site_type,
      s.site_type_label,
      s.max_party_size,
      s.max_equipment_length_ft,
      s.amenities,
      s.allowed_equipment,
      s.rule_summary,
      p.operator_id,
      p.slug AS park_slug
    FROM sites s
    JOIN campgrounds c ON c.id = s.campground_id
    JOIN parks p ON p.id = c.park_id
    WHERE s.id = ANY(${siteIds})
  `;
  const facts = new Map(siteRows.map((row) => [row.id, row]));
  assert(facts.size === siteIds.length, `${scenario.name}: missing site facts for returned sites`);

  const availabilityRows = await db<AvailabilityFact[]>`
    SELECT site_id, night_date::text AS night_date, status
    FROM site_availability
    WHERE site_id = ANY(${siteIds})
      AND night_date = ANY(${nights}::date[])
  `;
  const available = new Set(
    availabilityRows
      .filter((row) => row.status === "available")
      .map((row) => `${row.site_id}|${row.night_date}`),
  );

  for (const segment of segments) {
    const fact = facts.get(segment.site.id);
    assert(fact, `${scenario.name}: missing fact for ${segment.site.id}`);
    assert(fact.park_slug === segment.park.slug, `${scenario.name}: result park slug does not match DB for ${segment.site.id}`);
    assert(
      !/\bseasonal\b/i.test(fact.site_type_label ?? fact.site_type),
      `${scenario.name}: seasonal site leaked into results (${segment.site.id})`,
    );
    assert(fact.max_party_size >= (scenario.params.party_size ?? 1), `${scenario.name}: party size exceeds site max for ${segment.site.id}`);
    if (scenario.params.site_types?.length) {
      assert(scenario.params.site_types.includes(fact.site_type), `${scenario.name}: site type filter leaked ${fact.site_type}`);
    }
    if (scenario.params.equipment_length_ft) {
      const allowedSignal = allowedEquipmentSupportsLength(fact.allowed_equipment, scenario.params.equipment_length_ft);
      const ruleLength = ruleSiteLengthFt(fact.rule_summary);
      assert(
        allowedSignal === true ||
          (allowedSignal == null &&
            (fact.max_equipment_length_ft == null || fact.max_equipment_length_ft >= scenario.params.equipment_length_ft) &&
            (ruleLength == null || ruleLength >= scenario.params.equipment_length_ft)),
        `${scenario.name}: equipment length filter leaked ${segment.site.id}`,
      );
    }
    if (scenario.params.operators?.length) {
      assert(scenario.params.operators.includes(fact.operator_id), `${scenario.name}: operator filter leaked ${fact.operator_id}`);
    }
    for (const amenity of scenario.params.amenities ?? []) {
      assert(fact.amenities.includes(amenity), `${scenario.name}: amenity filter leaked ${segment.site.id} without ${amenity}`);
    }
    for (const night of segment.availability.nights) {
      assert(available.has(`${segment.site.id}|${night}`), `${scenario.name}: ${segment.site.id} is not available on ${night}`);
    }
  }
}

function validateResultShape(scenario: Scenario, result: SearchResult) {
  const params = scenario.params;
  const requested = requestedNights(params);
  const segments = allSegments(result);
  const segmentNights = sorted(segments.flatMap((segment) => segment.availability.nights));
  const resultNights = sorted(result.availability.nights);

  assert(result.booking_url.startsWith("http"), `${scenario.name}: missing booking URL`);
  assert(result.site.thumbnail_url || result.park.name, `${scenario.name}: result missing visual fallback context`);
  assert(result.stay?.mode === (params.stay_mode ?? "same_site"), `${scenario.name}: stay mode mismatch`);
  assert(result.stay.segment_count === segments.length, `${scenario.name}: segment count mismatch`);
  assert(unique(segmentNights).length === segmentNights.length, `${scenario.name}: duplicate itinerary nights`);
  assert(segmentNights.join("|") === resultNights.join("|"), `${scenario.name}: itinerary nights do not match card nights`);

  if (requested && requested.length > 0) {
    if (params.flexible) {
      const minNights = Math.max(1, params.min_nights ?? 1);
      assert(resultNights.length >= minNights, `${scenario.name}: flexible result has too few nights`);
      for (const night of resultNights) {
        assert(requested.includes(night), `${scenario.name}: flexible result night outside requested window`);
      }
    } else {
      assert(resultNights.join("|") === requested.join("|"), `${scenario.name}: fixed result does not cover requested dates`);
    }
  } else {
    assert(resultNights.length > 0 && resultNights.length <= 7, `${scenario.name}: no-date result should show up to 7 nights`);
  }

  if (params.lat != null && params.lng != null && result.park.distance_km != null && params.radius_km != null && !params.park_slugs?.length) {
    assert(result.park.distance_km <= params.radius_km + 0.5, `${scenario.name}: result outside radius`);
  }

  if (params.park_slugs?.length) {
    for (const segment of segments) {
      assert(params.park_slugs.includes(segment.park.slug), `${scenario.name}: park filter leaked ${segment.park.slug}`);
    }
  }

  if (params.stay_mode === "same_site" || !params.stay_mode) {
    assert(result.stay.move_count === 0, `${scenario.name}: same-site result moved sites`);
    assert(result.stay.park_count === 1, `${scenario.name}: same-site result spans parks`);
    assert(result.stay.segment_count === 1, `${scenario.name}: same-site result has multiple segments`);
  }

  if (params.stay_mode === "same_park") {
    assert(result.stay.move_count > 0, `${scenario.name}: same-park result did not force a site change`);
    assert(result.stay.park_count === 1, `${scenario.name}: same-park result changed parks`);
    assert(result.stay.segment_count === resultNights.length, `${scenario.name}: same-park route did not create a stop per night`);
    assert(unique(segments.map((segment) => segment.site.id)).length === resultNights.length, `${scenario.name}: same-park route reused a campsite`);
  }

  if (params.stay_mode === "anywhere") {
    assert(result.stay.move_count > 0, `${scenario.name}: nightly route did not force a site change`);
    assert(result.stay.park_count > 1, `${scenario.name}: nightly route did not force a park change`);
    assert(result.stay.segment_count === resultNights.length, `${scenario.name}: nightly route did not create a stop per night`);
    assert(unique(segments.map((segment) => segment.site.id)).length === resultNights.length, `${scenario.name}: nightly route reused a campsite`);
    for (let i = 1; i < segments.length; i += 1) {
      assert(
        segments[i].park.slug !== segments[i - 1].park.slug,
        `${scenario.name}: nightly route reused park ${segments[i].park.slug} on adjacent nights`,
      );
    }
    if (params.end_lat != null && params.end_lng != null) {
      assert(result.stay.end_distance_km != null, `${scenario.name}: endpoint route missing end distance`);
    }
  }
}

async function validateScenario(scenario: Scenario) {
  const response = await runSearch(scenario.params);
  assert(response.results.length <= (scenario.params.limit ?? RESULT_LIMIT), `${scenario.name}: limit was not respected`);
  assert(response.total >= response.results.length, `${scenario.name}: total is smaller than returned results`);

  if (scenario.expectEmpty) {
    assert(response.total === 0 && response.results.length === 0, `${scenario.name}: expected no results`);
    return { total: response.total, returned: response.results.length };
  }

  for (const result of response.results) validateResultShape(scenario, result);

  const sort = scenario.params.sort;
  if (sort && response.results.length > 1) {
    for (let i = 1; i < response.results.length; i += 1) {
      assert(compareMetrics(response.results[i - 1], response.results[i], sort) <= 0, `${scenario.name}: ${sort} sort order regressed`);
    }
  }

  await validateAgainstDatabase(scenario, response.results);
  return { total: response.total, returned: response.results.length };
}

async function validateNightlyRouteChangesParksWithoutEndpoint() {
  const shared = {
    ...LOCATIONS.toronto,
    start_date: "2026-06-12",
    end_date: "2026-06-16",
    party_size: 2,
    limit: RESULT_LIMIT,
  } satisfies SearchParams;
  const nightly = await runSearch({ ...shared, stay_mode: "anywhere", sort: "route" });
  assert(nightly.total > 0, "nightly route without an endpoint returned no results");
  for (const result of nightly.results) {
    const segments = allSegments(result);
    assert(result.stay?.park_count > 1, "nightly route did not span parks");
    for (let i = 1; i < segments.length; i += 1) {
      assert(segments[i].park.slug !== segments[i - 1].park.slug, "nightly route reused a park on adjacent nights");
    }
  }
  return { nightly: nightly.total };
}

async function validateGroupedPagination() {
  const shared = {
    ...LOCATIONS.toronto,
    start_date: "2026-06-12",
    end_date: "2026-06-16",
    party_size: 2,
    stay_mode: "same_site" as const,
    sort: "distance" as const,
    group_by: "park" as const,
    group_limit: 10,
    group_result_limit: 3,
  } satisfies SearchParams;
  const page1 = await runSearch({ ...shared, group_offset: 0 });
  const page2 = await runSearch({ ...shared, group_offset: 10 });
  assert(page1.groups && page1.groups.length > 0 && page1.groups.length <= 10, "grouped search did not return a bounded first group page");
  assert(page1.group_total != null && page1.group_total >= page1.groups.length, "grouped search did not include total group count");
  assert(page1.results.length <= page1.groups.length * 3, "grouped search returned too many loaded results per group");
  for (const group of page1.groups) {
    assert(group.result_count >= group.results.length, `group ${group.label} result count is smaller than loaded results`);
    assert(group.results.length <= 3, `group ${group.label} exceeded the per-group result limit`);
  }
  if (page2.groups && page2.groups.length > 0) {
    const page1Keys = new Set(page1.groups.map((group) => group.key));
    for (const group of page2.groups) {
      assert(!page1Keys.has(group.key), `group pagination repeated ${group.label} on page 2`);
    }
  }
  return { total: page1.total, groupTotal: page1.group_total ?? 0, page1: page1.groups.length, page2: page2.groups?.length ?? 0 };
}

async function main() {
  const scenarios = scenarioList();
  let passed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];
  console.log(`Running ${scenarios.length} search QA scenarios with limit ${RESULT_LIMIT}...`);

  for (const [index, scenario] of scenarios.entries()) {
    const start = Date.now();
    try {
      const summary = await validateScenario(scenario);
      passed += 1;
      console.log(
        `[${index + 1}/${scenarios.length}] PASS ${scenario.name} (${summary.returned}/${summary.total}) ${Date.now() - start}ms`,
      );
    } catch (error) {
      failures.push({ name: scenario.name, error });
      console.error(`[${index + 1}/${scenarios.length}] FAIL ${scenario.name}`);
      console.error(error);
    }
  }

  try {
    const summary = await validateNightlyRouteChangesParksWithoutEndpoint();
    passed += 1;
    console.log(`[extra] PASS nightly route changes parks without endpoint (${summary.nightly})`);
  } catch (error) {
    failures.push({ name: "nightly route changes parks without endpoint", error });
    console.error("[extra] FAIL nightly route changes parks without endpoint");
    console.error(error);
  }

  try {
    const summary = await validateGroupedPagination();
    passed += 1;
    console.log(`[extra] PASS grouped pagination (${summary.page1}+${summary.page2}/${summary.groupTotal} groups, ${summary.total} results)`);
  } catch (error) {
    failures.push({ name: "grouped pagination", error });
    console.error("[extra] FAIL grouped pagination");
    console.error(error);
  }

  await sql().end({ timeout: 2 }).catch(() => undefined);
  console.log(`${passed}/${scenarios.length + 2} scenarios passed`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await sql().end({ timeout: 2 }).catch(() => undefined);
  process.exitCode = 1;
});
