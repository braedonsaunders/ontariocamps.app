import { addDays } from "./provider-utils";

export type LetsCampImage = {
  _id?: string;
  publicId?: string;
  url?: string;
  sizes?: Record<string, string>;
};

export type LetsCampCamp = {
  _id: string;
  name: string;
  bio?: string;
  slug?: string;
  info?: {
    lat?: number;
    lng?: number;
    physicalAddress?: string;
    website?: string;
  };
  featuredImage?: LetsCampImage | null;
  logo?: LetsCampImage | null;
  map?: LetsCampImage | null;
  mapId?: string | null;
  siteSearchCriteria?: {
    allowedUnitTypes?: string[];
    allowPets?: boolean;
  };
  settings?: {
    minNights?: number;
    collectVehicleDataEnable?: boolean;
  };
};

export type LetsCampSite = {
  _id: string;
  campId: string;
  siteNumber: string;
  description?: string;
  width?: { amount?: number; unit?: string } | null;
  length?: { amount?: number; unit?: string } | null;
  maxCampers?: number;
  accessible?: boolean;
  pullThrough?: boolean;
  water?: boolean;
  sewer?: boolean;
  electrical?: number[] | number | null;
  minNights?: number;
  maxNights?: number;
  minRvLength?: { amount?: number; unit?: string } | null;
  maxRvLength?: { amount?: number; unit?: string } | null;
  allowedUnitTypes?: string[];
  mapLocation?: string;
  allowPets?: boolean;
  gallery?: Array<{ url?: string; sizes?: Record<string, string> }>;
  siteTypes?: Array<{ name?: string }>;
};

export type LetsCampSearchResponse = {
  sites?: LetsCampSite[];
  metaData?: {
    minNights?: number;
    availabilityInfo?: {
      bookedSiteIds?: string[];
      lockedSiteIds?: string[];
    };
  };
};

export class LetsCampClient {
  constructor(private readonly baseUrl = "https://letscamp.ca") {}

  private headers(): HeadersInit {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-tenant-type": "camp",
    };
  }

  async getCamp(slugOrId: string): Promise<LetsCampCamp> {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/api/camps/${encodeURIComponent(slugOrId)}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Let's Camp camp ${slugOrId}: HTTP ${response.status}`);
    const data = await response.json() as { camp?: LetsCampCamp | null };
    if (!data.camp) throw new Error(`Let's Camp camp ${slugOrId}: not found`);
    return data.camp;
  }

  async getSites(campId: string): Promise<LetsCampSite[]> {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/api/camps/${encodeURIComponent(campId)}/sites`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Let's Camp sites ${campId}: HTTP ${response.status}`);
    const data = await response.json() as { sites?: LetsCampSite[] };
    return data.sites ?? [];
  }

  private unitSearches(camp: LetsCampCamp) {
    const allowed = camp.siteSearchCriteria?.allowedUnitTypes?.length
      ? camp.siteSearchCriteria.allowedUnitTypes
      : ["tent"];
    return allowed.map((unitType, i) => ({
      unitType,
      unitTypes: [
        unitType === "rv"
          ? { uid: `unitTypeSiteSearch_${i}`, unitType, length: 20, measurementUnit: "ft" }
          : { uid: `unitTypeSiteSearch_${i}`, unitType },
      ],
    }));
  }

  async searchAvailability(args: {
    camp: LetsCampCamp;
    startDate: string;
    endDate?: string;
  }): Promise<LetsCampSearchResponse[]> {
    const minNights = Math.max(1, Math.floor(args.camp.settings?.minNights ?? 1));
    const endDate = args.endDate ?? addDays(args.startDate, minNights);
    const searches = this.unitSearches(args.camp);
    const out: LetsCampSearchResponse[] = [];
    for (const search of searches) {
      const body = {
        startDate: args.startDate,
        endDate,
        guestCount: { infant: 0, youth: 0, adult: 2, senior: 0 },
        numPets: 0,
        unitTypes: search.unitTypes,
        electrical: [],
        water: false,
        sewer: false,
        pullThrough: false,
        accessible: false,
        allowPastDates: false,
        numVehicles: args.camp.settings?.collectVehicleDataEnable ? 1 : undefined,
      };
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/api/camps/${encodeURIComponent(args.camp._id)}/sites/available/search`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Let's Camp availability ${args.camp._id}: HTTP ${response.status}`);
      out.push(await response.json() as LetsCampSearchResponse);
    }
    return out;
  }
}
