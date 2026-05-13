import { addDays } from "./provider-utils";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export type CamplifeMedia = {
  id?: number | string;
  url?: string | null;
  type?: string;
  contentType?: string;
  primary?: boolean;
  caption?: string | null;
  textSummary?: string | null;
};

export type CamplifeCampgroundListing = {
  id: number;
  name: string;
  encodedName?: string;
  lat?: string | number | null;
  lon?: string | number | null;
  city?: string | null;
  stateProvince?: string | null;
  media?: CamplifeMedia | null;
  description?: string | null;
};

export type CamplifeBranding = {
  id?: string;
  name?: string;
  logoMedia?: CamplifeMedia | null;
  navigate?: { url?: string | null; toolTip?: string | null };
  background?: {
    gradient1?: string | null;
    media?: CamplifeMedia | null;
  } | null;
};

export type CamplifeCampground = {
  id: number;
  name: string;
  timeZone?: string;
  alias?: string | null;
  currency?: string;
};

export type CamplifeAmenity = { id: number; name: string };
export type CamplifeEquipmentType = { id: number; name: string };
export type CamplifeSiteType = {
  id: number;
  name: string;
  equipTypeIds?: number[];
  amenityIds?: number[];
};

export type CamplifeSessionSite = {
  id: number;
  name: string;
  order?: number;
  typeName?: string;
  isLoaded?: boolean;
  mediaObjects?: CamplifeMedia[];
};

export type CamplifeReservationSession = {
  branding?: CamplifeBranding | null;
  campground?: CamplifeCampground | null;
  config?: {
    siteTypes?: CamplifeSiteType[];
    equipTypes?: CamplifeEquipmentType[];
    amenities?: CamplifeAmenity[];
    encodedName?: string;
    campgroundAddress?: string | null;
    campgroundPhone?: string | null;
    validationConfig?: Record<string, { required?: boolean }>;
    isMarina?: boolean;
  };
  siteMap?: Record<string, CamplifeSessionSite>;
  session?: unknown;
};

export type CamplifeSiteDetail = {
  description?: string | null;
  amenityIds?: number[];
  width?: number | null;
  maxLength?: number | null;
  mediaObjects?: CamplifeMedia[];
  equipTypeIds?: number[];
  requiresEquipment?: boolean;
  isLoaded?: boolean;
};

export type CamplifeAvailabilitySite = {
  id: number;
  isFiltered?: boolean;
};

export type CamplifeAvailabilityResponse = {
  sites?: CamplifeAvailabilitySite[];
  errors?: { general?: Array<{ message?: string }> };
  warnings?: { general?: Array<{ message?: string }> };
  groupedMessage?: unknown;
  closed?: boolean;
};

function closedAvailabilityError(data: CamplifeAvailabilityResponse, status: number): boolean {
  const messages = [
    ...(data.errors?.general ?? []),
    ...(data.warnings?.general ?? []),
  ].map((m) => m.message ?? "").join(" ").toLowerCase();
  if (!messages) return false;
  if (status === 400) return true;
  return /\b(closed|not open|choose different dates|select different dates|different dates|outside|not available|no availability|not accepting|park is open|open from|open season)\b/.test(messages);
}

export class CamplifeClient {
  constructor(private readonly baseUrl = "https://www.camplife.com") {}

  private root(): string {
    return this.baseUrl.replace(/\/+$/, "");
  }

  private headers(campgroundId?: string | number): HeadersInit {
    const root = this.root();
    return {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-CA,en;q=0.9",
      "Content-Type": "application/json",
      Origin: root,
      Referer: campgroundId ? `${root}/${campgroundId}/reservation/step1` : `${root}/`,
      "User-Agent": USER_AGENT,
    };
  }

  async listOntarioCampgrounds(): Promise<CamplifeCampgroundListing[]> {
    const response = await fetch(`${this.root()}/api/campgrounds?state=ON&all=true`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`CampLife Ontario campgrounds: HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data as CamplifeCampgroundListing[] : [];
  }

  async getReservationSession(campgroundIdOrAlias: number | string): Promise<CamplifeReservationSession> {
    const url = new URL(`${this.root()}/api/reservation/session`);
    url.searchParams.set("t", String(Date.now()));
    url.searchParams.set("campgroundIdOrAlias", String(campgroundIdOrAlias));
    const response = await fetch(url, {
      headers: this.headers(campgroundIdOrAlias),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`CampLife session ${campgroundIdOrAlias}: HTTP ${response.status}`);
    return await response.json() as CamplifeReservationSession;
  }

  async getMapSvg(campgroundId: number | string): Promise<string | null> {
    const response = await fetch(`${this.root()}/api/campground/${encodeURIComponent(String(campgroundId))}/map`, {
      headers: {
        Accept: "image/svg+xml,image/*,*/*;q=0.8",
        Referer: `${this.root()}/${campgroundId}/reservation/step1`,
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`CampLife map ${campgroundId}: HTTP ${response.status}`);
    const text = await response.text();
    const head = text.trimStart().slice(0, 256).toLowerCase();
    return head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg")) ? text : null;
  }

  async getSite(campgroundId: number | string, siteId: number | string): Promise<CamplifeSiteDetail> {
    const url = new URL(`${this.root()}/api/campground/${encodeURIComponent(String(campgroundId))}/site/${encodeURIComponent(String(siteId))}`);
    url.searchParams.set("t", String(Date.now()));
    const response = await fetch(url, {
      headers: this.headers(campgroundId),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`CampLife site ${campgroundId}/${siteId}: HTTP ${response.status}`);
    return await response.json() as CamplifeSiteDetail;
  }

  async getAvailability(args: {
    campgroundId: number | string;
    startDate: string;
    endDate?: string;
  }): Promise<CamplifeAvailabilityResponse> {
    const body = {
      flexible: false,
      displayStartDate: "",
      checkinDate: args.startDate,
      checkoutDate: args.endDate ?? addDays(args.startDate, 1),
    };
    const response = await fetch(`${this.root()}/api/campground/${encodeURIComponent(String(args.campgroundId))}/availability`, {
      method: "POST",
      headers: this.headers(args.campgroundId),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => ({})) as CamplifeAvailabilityResponse;
    if (!response.ok) {
      if (closedAvailabilityError(data, response.status)) return { ...data, closed: true };
      const message = data.errors?.general?.map((e) => e.message).filter(Boolean).join("; ");
      throw new Error(`CampLife availability ${args.campgroundId}: HTTP ${response.status}${message ? `: ${message}` : ""}`);
    }
    return data;
  }
}

export function decodeCamplifeStatus(siteId: string | number, response: CamplifeAvailabilityResponse): "available" | "reserved" | "closed" | "unknown" {
  if (response.closed) return "closed";
  const sites = response.sites ?? [];
  return sites.some((site) => String(site.id) === String(siteId)) ? "available" : "reserved";
}
