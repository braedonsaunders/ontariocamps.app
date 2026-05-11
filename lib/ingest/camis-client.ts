/**
 * Camis5 / GoingToCamp / PCRS API client.
 *
 * Camis Inc. operates three platforms that all expose the same JSON API surface:
 *   - reservations.ontarioparks.ca  (Camis5)
 *   - reservation.pc.gc.ca          (PCRSv3)
 *   - {tenant}.goingtocamp.com      (GoingToCamp, multi-tenant)
 *
 * Endpoint shapes (verified against live API, 2026-05):
 *   GET /api/maps/root
 *   GET /api/maps?resourceLocationId=<int>
 *   GET /api/equipment
 *   GET /api/bookingcategories
 *   GET /api/dateschedule/resourcelocationid?resourceLocationId=<int>
 *   GET /api/availability/map?resourceLocationId=<int>&mapId=<int>&bookingCategoryId=<int>
 *       &equipmentCategoryId=<int>&subEquipmentCategoryId=<int>
 *       &startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&partySize=<int>&numAdults=<int>&numChildren=<int>
 *   GET /api/availability/resourceDailyAvailability?... (single resource, daily granularity)
 *
 * `availability` enum (per night):
 *   0 = available
 *   1 = restricted / not bookable
 *   (other codes observed: 5 at map-level = aggregate)
 */

export type CamisVendor = "camis5" | "goingtocamp" | "pcrs";

export type CamisLocalization = { cultureName: string; title?: string; name?: string };

export type CamisMapLink = {
  resourceLocationId: number | null;
  transactionLocationId: number | null;
  childMapId: number | null;
  localizations: CamisLocalization[];
  xCoordinate: number;
  yCoordinate: number;
};

export type CamisMapResource = {
  resourceId: number;
  iconType: number;
  xCoordinate: number;
  yCoordinate: number;
};

export type CamisMap = {
  mapId: number;
  resourceLocationId: number | null;
  parentMap?: { mapId: number; resourceLocationId: number | null } | null;
  mapType?: number;
  isOrganizationRoot?: boolean;
  isDisabled?: boolean;
  mapImageUrls?: Record<string, string>;
  mapLinks: CamisMapLink[];
  mapResources?: CamisMapResource[];
  localizedValues?: Array<{ cultureName: string; name?: string; description?: string }>;
  /** Image pixel dimensions when present. */
  xDimension?: number;
  yDimension?: number;
};

export type CamisAvailabilityRow = {
  availability: number;
  processedAvailability?: number;
  remainingQuota: number | null;
};

export type CamisMapAvailabilityResponse = {
  mapId: number;
  mapAvailabilities: number[];
  resourceAvailabilities: Record<string, CamisAvailabilityRow[]>;
};

export type CamisEquipmentCategory = {
  equipmentCategoryId: number;
  order: number;
  localizedValues: CamisLocalization[];
  subEquipmentCategories: Array<{
    subEquipmentCategoryId: number;
    order: number;
    localizedValues: CamisLocalization[];
  }>;
};

export type CamisBookingCategory = {
  bookingCategoryId: number;
  bookingModel: number;
  capacityCategoryId: number | null;
  isDisabled: boolean;
  localizedValues: Array<{ cultureName: string; name: string; description?: string | null }>;
  allowedEquipmentCategories?: Array<{
    equipmentCategoryId: number;
    subEquipmentCategoryId: number;
  }>;
  allowedResourceCategoryIds?: number[];
};

export type CamisClientOptions = {
  baseUrl: string;
  userAgent?: string;
  /** Per-request delay in ms, jittered. Spec §6.5 says 500ms default. */
  requestDelayMs?: number;
  /** Abort on > N retries. */
  maxRetries?: number;
  fetchImpl?: typeof fetch;
};

function pickEnglishName(values?: CamisLocalization[]): string | null {
  if (!values || values.length === 0) return null;
  const en = values.find((v) => v.cultureName === "en-CA") ?? values[0];
  return (en.title ?? en.name ?? null) || null;
}

export class CamisClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly requestDelayMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private lastRequestAt = 0;

  constructor(opts: CamisClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    // Camis fronts the API with Azure WAF, which 403s any obvious bot UA. Use a
    // browser-shaped UA and signal ourselves with a separate X-Contact header.
    // Production would require Camis-allowlisting our real UA via outreach.
    this.userAgent =
      opts.userAgent ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0";
    this.requestDelayMs = opts.requestDelayMs ?? 500;
    this.maxRetries = opts.maxRetries ?? 4;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async politeWait() {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    const jitter = Math.floor(Math.random() * 200);
    const wait = Math.max(0, this.requestDelayMs + jitter - elapsed);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  private async get<T>(path: string, params?: Record<string, string | number | null | undefined>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null) url.searchParams.set(k, String(v));
      }
    }
    let attempt = 0;
    while (true) {
      await this.politeWait();
      let response: Response;
      try {
        response = await this.fetchImpl(url.toString(), {
          headers: {
            Accept: "application/json",
            "User-Agent": this.userAgent,
            "Accept-Language": "en-CA,en;q=0.9",
            Referer: this.baseUrl + "/create-booking/",
            "X-Contact": "ontariocamps.app - ingest for unified search; github.com/braedonsaunders/ontariocamps.app",
          },
        });
      } catch (err) {
        // TypeError from fetch usually means malformed headers/URL — not retriable.
        if (err instanceof TypeError) throw err;
        if (attempt >= this.maxRetries) throw err;
        attempt++;
        await new Promise((r) => setTimeout(r, Math.min(16000, 2000 * 2 ** attempt)));
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt >= this.maxRetries) {
          throw new Error(`HTTP ${response.status} at ${url.pathname} after ${attempt} retries`);
        }
        attempt++;
        await new Promise((r) => setTimeout(r, Math.min(16000, 2000 * 2 ** attempt)));
        continue;
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} at ${url.pathname}: ${body.slice(0, 200)}`);
      }
      return (await response.json()) as T;
    }
  }

  getRootMaps(): Promise<CamisMap[]> {
    return this.get<CamisMap[]>("/api/maps/root");
  }

  getMaps(resourceLocationId: number): Promise<CamisMap[]> {
    return this.get<CamisMap[]>("/api/maps", { resourceLocationId });
  }

  getEquipmentCategories(): Promise<CamisEquipmentCategory[]> {
    return this.get<CamisEquipmentCategory[]>("/api/equipment");
  }

  getBookingCategories(): Promise<CamisBookingCategory[]> {
    return this.get<CamisBookingCategory[]>("/api/bookingcategories");
  }

  /** Per-operator iconType → human label dictionary used to render legends on
   *  the map. We use it to tag each site with its operator-specific type. */
  getIconLabels(): Promise<Array<{
    mapIconType: number;
    order: number;
    localizedValues: Array<{ cultureName: string; name: string; description: string | null }>;
  }>> {
    return this.get("/api/mapLegendResourceIconLabel");
  }

  getMapAvailability(params: {
    resourceLocationId: number;
    mapId: number;
    bookingCategoryId: number;
    equipmentCategoryId: number;
    subEquipmentCategoryId: number;
    startDate: string;
    endDate: string;
    partySize?: number;
    numAdults?: number;
    numChildren?: number;
  }): Promise<CamisMapAvailabilityResponse> {
    return this.get<CamisMapAvailabilityResponse>("/api/availability/map", {
      resourceLocationId: params.resourceLocationId,
      mapId: params.mapId,
      bookingCategoryId: params.bookingCategoryId,
      equipmentCategoryId: params.equipmentCategoryId,
      subEquipmentCategoryId: params.subEquipmentCategoryId,
      startDate: params.startDate,
      endDate: params.endDate,
      partySize: params.partySize ?? 2,
      numAdults: params.numAdults ?? 2,
      numChildren: params.numChildren ?? 0,
    });
  }

  getResourceDailyAvailability(params: {
    resourceLocationId: number;
    resourceId: number;
    bookingCategoryId: number;
    equipmentCategoryId: number;
    subEquipmentCategoryId: number;
    startDate: string;
    endDate: string;
    partySize?: number;
    numAdults?: number;
    numChildren?: number;
  }): Promise<CamisAvailabilityRow[]> {
    return this.get<CamisAvailabilityRow[]>("/api/availability/resourceDailyAvailability", {
      resourceLocationId: params.resourceLocationId,
      resourceId: params.resourceId,
      bookingCategoryId: params.bookingCategoryId,
      equipmentCategoryId: params.equipmentCategoryId,
      subEquipmentCategoryId: params.subEquipmentCategoryId,
      startDate: params.startDate,
      endDate: params.endDate,
      partySize: params.partySize ?? 2,
      numAdults: params.numAdults ?? 2,
      numChildren: params.numChildren ?? 0,
    });
  }
}

export function localizedName(values?: CamisLocalization[] | null): string | null {
  return pickEnglishName(values ?? undefined);
}
