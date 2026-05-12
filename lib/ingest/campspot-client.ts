import { addDays } from "./provider-utils";

const CLIENT_ID = "60jmeb5kmfgfkeljne4car54vo";

export type CampspotPark = {
  id: number;
  name: string;
  displayName?: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  media?: { mainImage?: { large?: { url?: string }; medium?: { url?: string }; originalImageUrl?: string } };
  mapUrl?: string;
  slug: string;
};

export type CampspotParkResponse = {
  park: CampspotPark;
  amenities?: string[];
  campsiteCategories?: Array<{ id: number; name: string; code: string }>;
  resortClosedDates?: Array<{ startDateInParkTimeZone: string; endDateInParkTimeZone: string }>;
};

export type CampspotAvailabilityRow = {
  id: number;
  campsiteCategoryCode?: string;
  campsites?: Array<{
    id: number;
    name: string;
    rvInfo?: { rvLengthMin?: number; rvLengthMax?: number; rvTypes?: string[] };
    amenities?: string[];
    availability?: string;
    preferredSiteType?: string;
  }>;
  name: string;
  description?: string;
  amenities?: string[];
  images?: Array<{ originalImageUrl?: string; large?: { url?: string }; medium?: { url?: string } }>
    | Record<string, { originalImageUrl?: string; large?: { url?: string }; medium?: { url?: string } }>;
  isPetFriendly?: boolean;
  isAccessible?: boolean;
  availability?: string;
  failureReasons?: Array<{ errorType?: string; reason?: string }>;
  parkId?: number;
};

export class CampspotClient {
  constructor(private readonly baseUrl = "https://www.campspot.com") {}

  private headers(refererSlug?: string): HeadersInit {
    return {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-CA,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      "x-cognito-userpool-clientid": CLIENT_ID,
      "x-client-type": "CONSUMER",
      Referer: `${this.baseUrl.replace(/\/+$/, "")}/book/${refererSlug ?? ""}`,
    };
  }

  async getPark(slug: string): Promise<CampspotParkResponse> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/api/gator-core/v2/parks/slug/${encodeURIComponent(slug)}?useCustomParkData=true`;
    const response = await fetch(url, { headers: this.headers(slug), signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error(`Campspot park ${slug}: HTTP ${response.status}`);
    return await response.json() as CampspotParkResponse;
  }

  async getAvailability(args: {
    parkId: number | string;
    parkSlug?: string;
    startDate: string;
    endDate?: string;
  }): Promise<CampspotAvailabilityRow[]> {
    const endDate = args.endDate ?? addDays(args.startDate, 1);
    const url = new URL(`${this.baseUrl.replace(/\/+$/, "")}/api/gator-core/v2/availability/parks/${args.parkId}`);
    url.searchParams.set("checkin", args.startDate);
    url.searchParams.set("checkout", endDate);
    url.searchParams.set("guests", "guests0,2,0");
    url.searchParams.set("useCustomParkData", "true");
    url.searchParams.set("includeUnavailable", "true");
    const response = await fetch(url, { headers: this.headers(args.parkSlug), signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error(`Campspot availability ${args.parkId}: HTTP ${response.status}`);
    return await response.json() as CampspotAvailabilityRow[];
  }
}

export function decodeCampspotStatus(row?: CampspotAvailabilityRow): "available" | "reserved" | "closed" | "unknown" {
  if (!row) return "unknown";
  if (row.availability === "AVAILABLE") return "available";
  const reason = (row.failureReasons ?? []).map((r) => `${r.errorType ?? ""} ${r.reason ?? ""}`).join(" ").toLowerCase();
  if (reason.includes("closed") || reason.includes("outside") || reason.includes("not accepting")) return "closed";
  return "reserved";
}
