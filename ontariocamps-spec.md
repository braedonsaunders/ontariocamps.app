# ontariocamps.app — Technical Specification

## 1. Overview

A unified search engine for campsite availability across Ontario's three major operators: Ontario Parks (provincial), Parks Canada (federal, Ontario sites), and Ontario's Conservation Authorities. The site indexes availability in near-real-time and redirects users to the operator's own booking flow to complete the reservation.

This is a search and discovery product, not a booking product. We do not handle reservations, payments, or accounts on behalf of operators.

## 2. Goals & Non-Goals

### Goals

- Single search across all three operators by date, location, party size, and equipment.
- Geographic search: radius from a postal code or pin, drive-time-aware filtering.
- Flexible-date queries: "any N consecutive nights in this window."
- Normalized amenities across vendors (electric, water, sewer, waterfront, accessible, pet-friendly, pull-through, etc).
- Map-first browse UI with availability density overlay.
- Deep-link to vendor booking pages with pre-populated search state.
- Freshness indicators on every result ("checked 4 minutes ago").

### Non-Goals (v1)

- User accounts.
- Bookings, payments, or any transactional flow.
- Reviews, ratings, photos, or user-generated content.
- Cancellation alerts / notifications. (Phase 2.)
- Coverage outside Ontario.
- Mobile native apps.

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ Vercel                                                         │
│  ┌──────────────────────────┐    ┌──────────────────────────┐  │
│  │ Next.js (app router)     │    │ Vercel Edge Cache         │ │
│  │  - Marketing pages        │    │  - Static park pages      │ │
│  │  - Search UI              │───>│  - API responses (60s)    │ │
│  │  - API routes (read-only) │    │                           │ │
│  └──────────────────────────┘    └──────────────────────────┘  │
│              │                                                  │
└──────────────┼──────────────────────────────────────────────────┘
               │ SQL (read-only, RLS-protected)
               ▼
┌────────────────────────────────────────────────────────────────┐
│ Supabase                                                       │
│  ┌──────────────────────────┐    ┌──────────────────────────┐  │
│  │ Postgres + PostGIS       │    │ Edge Functions (Deno)    │  │
│  │  - operators              │<──>│  - ingest-goingtocamp     │ │
│  │  - parks                  │    │  - ingest-ontarioparks    │ │
│  │  - campgrounds            │    │  - ingest-parkscanada     │ │
│  │  - sites                  │    │  - reconcile              │ │
│  │  - availability           │    │                           │ │
│  │  - amenities              │    └──────────────────────────┘  │
│  └──────────────────────────┘             ▲                   │
│              ▲                            │                    │
│              │ pg_cron schedules ─────────┘                    │
│              │                                                 │
└──────────────┴─────────────────────────────────────────────────┘
                              │
                              ▼ (outbound HTTPS)
              ┌────────────────────────────────────┐
              │ Camis5 (reservations.ontarioparks) │
              │ Camis5 (Parks Canada)              │
              │ GoingToCamp (*.goingtocamp.com)    │
              └────────────────────────────────────┘
```

### Why this split

- Frontend on Vercel: SSR for marketing/SEO, ISR for park pages, edge cache for API.
- Data plane on Supabase: Postgres + PostGIS handles the actual hard work (geo queries, availability scans, flexible-date windows).
- Ingest on Supabase Edge Functions: scheduled by pg_cron, no Vercel function timeout limits, runs adjacent to the DB.
- Frontend never touches operators directly. All vendor IO is in Edge Functions.

## 4. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Hosting | Vercel | Next.js native, generous free/Pro tier, edge cache |
| Framework | Next.js 15 (app router) | Server components, ISR, route handlers |
| Database | Supabase Postgres 15 + PostGIS | Geo queries, partitioning, mature SQL |
| Ingest workers | Supabase Edge Functions (Deno) | 150s runtime, scheduled via pg_cron |
| Search index | Postgres FTS5 + trigram for v1; consider Typesense later | Avoid premature complexity |
| Map | MapLibre GL + Protomaps tiles | No per-request fees, self-hostable tiles |
| Styling | Tailwind 4 + shadcn/ui | Consistent with existing projects |
| Forms / state | React Server Components + URL state (nuqs) | Search state in URL = shareable, SEO-friendly |
| Auth | None for v1 | No accounts |
| Monitoring | Supabase logs + Vercel Analytics + Sentry (free tier) | |
| Email (Phase 2) | Resend | When cancellation alerts ship |

## 5. Data Model

PostGIS extension required. All timestamps `timestamptz`.

```sql
-- Operators: the three vendor accounts we ingest from
create table operators (
  id            text primary key,           -- 'ontario_parks', 'parks_canada', 'lprca', ...
  name          text not null,
  vendor        text not null,              -- 'camis5' | 'goingtocamp' | 'pcrs'
  base_url      text not null,
  booking_url   text not null,              -- where to deep-link users for booking
  active        boolean not null default true,
  created_at    timestamptz default now()
);

-- Parks / conservation areas / national parks
create table parks (
  id            uuid primary key default gen_random_uuid(),
  operator_id   text not null references operators(id),
  vendor_park_id text not null,             -- operator's own identifier
  slug          text not null unique,       -- 'algonquin', 'long-point', 'pukaskwa'
  name          text not null,
  description   text,
  region        text,                       -- 'Northern', 'Southwestern', etc.
  location      geography(point, 4326) not null,
  address       text,
  hero_image_url text,
  vendor_url    text not null,              -- canonical link on operator site
  metadata      jsonb default '{}'::jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (operator_id, vendor_park_id)
);
create index parks_location_gix on parks using gist (location);
create index parks_operator_idx on parks (operator_id);

-- Campgrounds within parks (most parks have multiple)
create table campgrounds (
  id            uuid primary key default gen_random_uuid(),
  park_id       uuid not null references parks(id) on delete cascade,
  vendor_map_id text not null,              -- Camis 'mapId' / GTC 'mapId'
  name          text not null,
  description   text,
  metadata      jsonb default '{}'::jsonb,
  unique (park_id, vendor_map_id)
);

-- Individual campsites
create table sites (
  id              uuid primary key default gen_random_uuid(),
  campground_id   uuid not null references campgrounds(id) on delete cascade,
  vendor_site_id  text not null,
  name            text not null,            -- '123', 'A-12', etc.
  site_type       text,                     -- 'tent' | 'rv' | 'cabin' | 'yurt' | 'backcountry'
  max_party_size  int,
  max_equipment_length_ft int,
  has_electric    boolean default false,
  has_water       boolean default false,
  has_sewer       boolean default false,
  is_pull_through boolean default false,
  is_accessible   boolean default false,
  is_pet_friendly boolean default true,
  is_waterfront   boolean default false,
  location        geography(point, 4326),   -- nullable; vendor map data
  metadata        jsonb default '{}'::jsonb,
  unique (campground_id, vendor_site_id)
);
create index sites_campground_idx on sites (campground_id);
create index sites_location_gix on sites using gist (location) where location is not null;

-- Normalized amenity vocabulary
create table amenities (
  code        text primary key,             -- 'electric_30a', 'lake_swim', 'fire_pit'
  label       text not null,
  category    text not null                 -- 'utilities' | 'water_access' | 'access' | ...
);

create table site_amenities (
  site_id     uuid references sites(id) on delete cascade,
  amenity_code text references amenities(code),
  primary key (site_id, amenity_code)
);
create index site_amenities_amenity_idx on site_amenities (amenity_code);

-- Vendor amenity code -> normalized code mapping
create table vendor_amenity_map (
  vendor      text not null,                -- 'camis5' | 'goingtocamp' | 'pcrs'
  vendor_code text not null,
  amenity_code text not null references amenities(code),
  primary key (vendor, vendor_code)
);

-- Availability: per-site per-night. Partitioned by month.
create table availability (
  site_id       uuid not null references sites(id) on delete cascade,
  night_date    date not null,
  status        text not null,              -- 'available' | 'reserved' | 'closed' | 'unknown'
  price_cents   int,
  last_checked_at timestamptz not null default now(),
  source_etag   text,
  primary key (site_id, night_date)
) partition by range (night_date);

-- Monthly partitions, auto-created via pg_cron
create table availability_y2026m05 partition of availability
  for values from ('2026-05-01') to ('2026-06-01');
-- ... etc

create index availability_date_idx on availability (night_date) where status = 'available';

-- Ingest job log for observability and debugging
create table ingest_runs (
  id            uuid primary key default gen_random_uuid(),
  operator_id   text not null references operators(id),
  job_type      text not null,              -- 'metadata' | 'availability'
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null,              -- 'running' | 'success' | 'partial' | 'failed'
  sites_checked int default 0,
  nights_updated int default 0,
  errors        jsonb default '[]'::jsonb
);
create index ingest_runs_operator_started_idx on ingest_runs (operator_id, started_at desc);

-- Saved searches (Phase 2, for alerts)
-- create table saved_searches (...);
```

### Why availability is partitioned

Per-night availability for ~10,000 sites × 5-month booking window = ~1.5M rows refreshed regularly. Monthly partitions keep query plans tight and let you drop old months trivially. Auto-create the next 6 months via a pg_cron job on the 1st of every month.

### PostGIS query examples

```sql
-- All sites within 100km of Hamilton with electric, available July 4-6
select s.*, p.name as park_name, st_distance(p.location, hamilton.geom)/1000 as km_away
from sites s
join campgrounds c on c.id = s.campground_id
join parks p on p.id = c.park_id
cross join (select st_makepoint(-79.866, 43.256)::geography as geom) hamilton
where s.has_electric = true
  and st_dwithin(p.location, hamilton.geom, 100000)
  and exists (
    select 1 from availability a
    where a.site_id = s.id
      and a.night_date in ('2026-07-04', '2026-07-05', '2026-07-06')
      and a.status = 'available'
    group by a.site_id
    having count(*) = 3
  )
order by km_away;
```

## 6. Ingest Pipeline

Three workers, one per vendor, all scheduled by `pg_cron`. Each is a Supabase Edge Function.

### 6.1 GoingToCamp (`ingest-goingtocamp`)

**Tenants in Ontario (to confirm):**
- `longpoint.goingtocamp.com` (Long Point Region CA)
- `stclair.goingtocamp.com` (St. Clair Region CA)
- `saugeen.goingtocamp.com` (Saugeen Valley CA)
- `grandriver.goingtocamp.com` (Grand River CA)
- `trcacamping.ca` (Toronto and Region CA, custom domain over GTC)
- Plus 15–20 more — full enumeration is part of Phase 0.

**Endpoint pattern (per tenant):**

```
GET  /api/resourcelocation/rootmaps           → park list with mapIds
GET  /api/maps/mapdatabyid?mapId=X            → campground + site layout
GET  /api/resource/details?resourceId=Y       → site details
POST /api/availability/resourcedailyavailability → availability for date range
GET  /api/equipment                           → equipment types
GET  /api/resourcecategory                    → site categories
```

All responses are clean JSON. No auth required for read endpoints.

**Function shape:**

```typescript
// supabase/functions/ingest-goingtocamp/index.ts
Deno.serve(async (req) => {
  const { operator_id, mode } = await req.json();  // mode: 'metadata' | 'availability'
  const operator = await db.operators.get(operator_id);
  const client = new GoingToCampClient(operator.base_url);

  if (mode === 'metadata') {
    const maps = await client.listRootMaps();
    for (const map of maps) {
      await upsertPark(operator_id, map);
      const mapData = await client.getMapData(map.id);
      for (const site of mapData.resources) {
        await upsertSite(map.id, site);
      }
    }
  } else {
    const sites = await db.sites.forOperator(operator_id);
    for (const batch of chunk(sites, 50)) {
      const avail = await client.dailyAvailability(batch.map(s => s.vendor_site_id), startDate, endDate);
      await upsertAvailability(avail);
    }
  }
  return new Response('ok');
});
```

### 6.2 Ontario Parks (`ingest-ontarioparks`)

The hard one. `reservations.ontarioparks.ca` is a Camis5 deployment with a custom frontend. Calls are a mix of REST JSON and HTML fragments. Phase 0 includes a full devtools capture session to enumerate endpoints.

Known characteristics:
- Bot detection via Akamai during peak windows (Feb–Apr at 7am ET when reservations open).
- Session cookies required for some endpoints.
- Availability data is queryable per-campground for date ranges.

**Strategy:**
1. Maintain a long-lived session pool (5–10 sessions, rotated).
2. Stagger requests across the day; back off aggressively on 429/403.
3. Identify with `User-Agent: ontariocamps.app/1.0 (contact: braedon@…)`.
4. During reservation-opening windows, suspend ingest entirely — those days are not safe to crawl on.
5. Refresh static metadata only when structure changes; refresh availability with tiered priority for near-term and bookable inventory.

If endpoints prove unworkable, fall back to Playwright running on a separate scheduled job (Cloudflare Browser Rendering or Browserless). Costs more but is resilient to frontend changes.

### 6.3 Parks Canada (`ingest-parkscanada`)

Camis backend (PCRSv3, contract through 2029). Frontend at `reservation.pc.gc.ca`. Likely closer to Ontario Parks than to GoingToCamp; investigate in Phase 1.

Scope is narrower than Ontario Parks for our purposes — we only ingest **Ontario national parks and sites**: Pukaskwa, Bruce Peninsula, Georgian Bay Islands, Point Pelee, Thousand Islands, Rouge, Trent-Severn, Rideau Canal lock-side camping, etc.

### 6.4 Schedules (pg_cron)

```sql
-- Metadata refresh: once a week, Sunday 03:00 ET
select cron.schedule('metadata-gtc-all',     '0 3 * * 0',  $$ select call_ingest_all('goingtocamp', 'metadata') $$);
select cron.schedule('metadata-ontario',     '15 3 * * 0', $$ select call_ingest('ontario_parks',  'metadata') $$);
select cron.schedule('metadata-parkscanada', '30 3 * * 0', $$ select call_ingest('parks_canada',   'metadata') $$);

-- Availability refresh: tiered near-term/bookable priority, plus on-demand site refresh
select cron.schedule('avail-daytime',  '*/15 11-3 * * *', $$ select call_ingest_all('*', 'availability') $$);
select cron.schedule('avail-overnight', '0 4-10 * * *',   $$ select call_ingest_all('*', 'availability') $$);
```

(Times in UTC. 11-3 UTC = 7am-11pm ET.)

### 6.5 Politeness & rate limiting

- Per-operator concurrent request cap: 2 (configurable).
- Per-operator request delay: 500ms between calls (jittered).
- Exponential backoff on 429: 2s, 4s, 8s, 16s, then abort run.
- Daily request budget tracked in `ingest_runs`; halt operator if budget exceeded.
- All outbound requests log to `ingest_runs.errors` on any non-2xx.

## 7. API Surface

All routes are Next.js route handlers under `/api/`. Read-only. Cached at edge for 60s except `/search` which is 30s.

```
GET /api/search
  ?lat=43.6&lng=-79.4&radius_km=100
  &start_date=2026-07-04&end_date=2026-07-06
  &min_nights=2&flexible=true
  &equipment=tent|rv32|trailer
  &amenities=electric,waterfront
  &operators=ontario_parks,gtc_lprca
  &limit=50&offset=0
→ { results: [{park, campground, site, nights_available, price, vendor_url}], total, freshness_p50 }

GET /api/park/[slug]
→ Park detail with all campgrounds and site counts

GET /api/park/[slug]/availability?start=...&end=...
→ Calendar grid of availability for a single park

GET /api/site/[id]
→ Site detail including amenities, photos, vendor link

GET /api/operators
→ List of operators with status + last successful ingest time

GET /api/health
→ Aggregate freshness stats: { ontario_parks: '4m ago', parks_canada: '12m ago', ... }
```

### Search response shape

```typescript
type SearchResult = {
  site: {
    id: string;
    name: string;
    site_type: string;
    amenities: string[];           // normalized codes
  };
  campground: {
    id: string;
    name: string;
  };
  park: {
    slug: string;
    name: string;
    operator: string;              // 'Ontario Parks', 'TRCA', etc.
    location: { lat: number; lng: number };
    distance_km?: number;          // if search was geo-anchored
  };
  availability: {
    nights: string[];              // ISO dates that match the query
    price_cents: number | null;
    last_checked_at: string;       // ISO timestamp
  };
  booking_url: string;             // deep link to vendor with state pre-populated
};
```

## 8. Frontend

### Pages

```
/                          Homepage: search box, featured parks, map preview
/search                    Results page: map + list, URL-state-driven
/park/[slug]               Park detail: campgrounds, photos, map, current availability summary
/park/[slug]/sites         Browse all sites in a park
/operator/[id]             All parks for an operator
/about                     About + ToS disclaimer
/data                      "How fresh is our data" page
```

### Search page layout

- Top: filter bar (dates, location, party size, equipment, amenities)
- Left (40%): result list, sortable by distance / availability density / name
- Right (60%): MapLibre map with clustered park pins, colored by availability density
- Each result card: park name + operator badge, site name, dates available, price, freshness, "Book on Ontario Parks →" button (vendor-styled)

### Deep linking out

Every result links directly to the operator's booking page with as much state pre-populated as possible:

- **GoingToCamp:** `https://{tenant}.goingtocamp.com/create-booking/results?mapId={mapId}&bookingCategoryId=0&startDate={start}&endDate={end}&isReserving=true&equipmentId={eq}&partySize={n}&resourceLocationId={loc}`
- **Ontario Parks:** form session pre-population is non-trivial; v1 links to the search results page with date+park selected.
- **Parks Canada:** similar to GoingToCamp pattern.

## 9. Search Query Patterns We Want to Win

These are the queries the operator sites cannot answer themselves and where we add real value:

1. **Geo radius.** "Anywhere within 90 minutes of Burlington, this weekend, electric."
2. **Cross-operator.** "All available sites for July long weekend across any operator."
3. **Flexible window.** "Any 3 consecutive nights between July 15 and July 30."
4. **Operator-agnostic browse.** "Show me everything within 50 km of Tobermory ranked by availability."
5. **Equipment-aware.** "Any site that takes a 32-foot trailer with electric."
6. **Cancellation discovery.** "Sites that became available in the last 24 hours" (uses `last_checked_at` deltas).

Each of these maps to a SQL query you can run today on the schema above. Build the queries before the UI; expose them as `/api/search` parameters; the UI is then a thin shell.

## 10. Deployment

### Environments

- **Production:** `ontariocamps.app` (Vercel) + production Supabase project.
- **Preview:** Vercel preview deploys on every PR, pointed at a `staging` Supabase project with abbreviated data.
- **Local:** Supabase CLI for local Postgres + Edge Functions, Next.js dev server.

### Secrets

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Vercel env vars.
- `INGEST_USER_AGENT` — identifying string sent on all outbound vendor requests.
- `MAPLIBRE_STYLE_URL`, `PROTOMAPS_API_KEY` (if using hosted tiles).
- Edge Function secrets set via `supabase secrets set`.

### Row Level Security

- All tables `enable row level security`.
- Anonymous role: `select` on operators, parks, campgrounds, sites, site_amenities, amenities, availability.
- Service role (used by Edge Functions): full access.
- No `insert/update/delete` from anon. Ever.

### Cost projection (rough, monthly)

- Vercel Pro: $20
- Supabase Pro: $25 (includes pg_cron, larger DB, more Edge Function invocations)
- Protomaps API: free tier likely sufficient, otherwise ~$10
- Domain: ~$15/year
- Total: ~$45/month at launch. Comfortable indie scale.

## 11. Roadmap

### Phase 0: Foundation (1–2 weeks)

- [ ] Buy `ontariocamps.app`, set up Vercel + Supabase projects.
- [ ] Bootstrap Next.js 15 app router project with Tailwind + shadcn.
- [ ] Apply schema migrations including PostGIS.
- [ ] Enumerate all Ontario GoingToCamp tenants. Document each operator's base URL, park IDs, contact for outreach.
- [ ] Devtools capture of `reservations.ontarioparks.ca` and `reservation.pc.gc.ca` — full session, all endpoints, all parameters.
- [ ] Build normalized amenity vocabulary (start with ~30 codes covering 95% of real-world filters).

### Phase 1: GoingToCamp end-to-end (1–2 weeks)

- [ ] Write `GoingToCampClient` in Deno/TypeScript.
- [ ] Write `ingest-goingtocamp` Edge Function with metadata + availability modes.
- [ ] Schedule via pg_cron.
- [ ] Vendor amenity mapping for GoingToCamp populated.
- [ ] Build `/api/search` with geo radius + date range working.
- [ ] Minimal search UI: form + result list (no map yet).
- [ ] Verify deep-link to GoingToCamp with state pre-population.

This phase produces a working product covering ~25% of Ontario campsites. Shippable as MVP.

### Phase 2: Map + Ontario Parks (2–3 weeks)

- [ ] MapLibre map view with clustered pins.
- [ ] `ingest-ontarioparks` Edge Function. Capture, replicate, test against real endpoints.
- [ ] Session pool + backoff strategy in production.
- [ ] Vendor amenity mapping for Camis5.
- [ ] Ontario Parks deep-linking strategy (may require Playwright-driven fallback).

### Phase 3: Parks Canada + polish (1–2 weeks)

- [ ] `ingest-parkscanada` Edge Function.
- [ ] Flexible-date search ("any N nights between X and Y").
- [ ] Park detail pages with availability calendar.
- [ ] Operator status dashboard, freshness indicators throughout UI.
- [ ] SEO: structured data, sitemap, per-park static pages with ISR.

### Phase 4: Differentiators (post-launch)

- Saved searches with email alerts (cancellation notifications).
- Drive-time-aware filtering (Mapbox Isochrone or similar).
- "Recently available" feed.
- iCal feed for upcoming bookings if user authenticates.
- Mobile responsive polish; PWA installable.
- Begin user accounts (auth via Supabase, magic link).

## 12. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Ontario Parks bot detection blocks us | High | Polite UA, low cadence, session rotation, Playwright fallback, honor 429s aggressively |
| Camis ToS enforcement | Low–Med | Public, transparent, contact info on every request; redirect-to-book (not bypass); cease if asked |
| Vendor API change breaks ingest | High over time | Per-operator integration tests run hourly, alerting on schema drift |
| Camis builds this themselves | Low | They have three separate contracts; would require coordinating Ontario Parks + Parks Canada + each CA |
| Reservation-window crawl spike causes incident | High during Feb–Apr | Hard suspend of ingest during 6:30–9:00 ET on opening days |
| Storage growth | Low | Monthly partition drops; only retain current + next 6 months |
| Geo data accuracy | Medium | Verify park lat/lng by hand for top 50 parks; community correction form |

## 13. Open Questions

- Trademark / branding risk on "ontariocamps.app" vs. Ontario Parks brand. Resolve before any paid acquisition.
- Reach out to TRCA / large CAs proactively to disclose what we're doing? Pro: goodwill, possibly direct data access. Con: invites a "no" we wouldn't otherwise hear.
- Reviews layer (Phase 4 or later): build native, integrate via Google Places, or skip entirely?
- Affiliate revenue: do any of the operators have a referral program? Investigate Parks Canada specifically.
- Photo licensing for park hero images: Ontario Parks blog content is gov-licensed but unclear terms; default to user-provided only.

## 14. Glossary

- **Camis** — Guelph-based vendor that operates both `reservations.ontarioparks.ca` (Camis5 platform) and the GoingToCamp white-label SaaS used by conservation authorities, and Parks Canada's PCRS.
- **GoingToCamp** — Camis's multi-tenant white-label product. Each customer (a conservation authority, a US state, etc.) gets a subdomain (`{tenant}.goingtocamp.com`) running an identical JSON API.
- **PCRS** — Parks Canada Reservation Service. Camis-powered; current contract runs through November 2029.
- **CA** — Conservation Authority. Ontario has 36 of them; not all operate campsites.
- **Camis5** — The current platform version Ontario Parks runs on. Frontend at `reservations.ontarioparks.ca` mixes JSON API and HTML fragment responses.
- **Frontcountry** — Drive-in car camping. Most of what we index.
- **Backcountry** — Hike/paddle-in interior sites (Algonquin, Killarney, etc.). In scope but may be deferred to Phase 2.
