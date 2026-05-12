type BookingUrlOptions = {
  resourceId?: string | number | null;
  mapId?: string | number | null;
  startDate?: string | null;
  endDate?: string | null;
  isReserving?: boolean;
};

function setParam(params: URLSearchParams, key: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return;
  params.set(key, String(value));
}

export function normalizeBookingUrlPath(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    url.pathname = url.pathname.replace(/\/create-booking\/search-results\/?$/, "/create-booking/results");
    return url.toString();
  } catch {
    return baseUrl.replace(/\/create-booking\/search-results\/?/, "/create-booking/results");
  }
}

export function addNights(startDate: string, nights = 1): string {
  const end = new Date(`${startDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + nights);
  return end.toISOString().slice(0, 10);
}

export function buildBookingUrl(baseUrl: string, options: BookingUrlOptions = {}): string {
  try {
    const url = new URL(normalizeBookingUrlPath(baseUrl));
    setParam(url.searchParams, "resourceId", options.resourceId);
    setParam(url.searchParams, "mapId", options.mapId);
    setParam(url.searchParams, "startDate", options.startDate);
    setParam(url.searchParams, "endDate", options.endDate);
    if (options.isReserving !== false) url.searchParams.set("isReserving", "true");
    return url.toString();
  } catch {
    const params = new URLSearchParams();
    setParam(params, "resourceId", options.resourceId);
    setParam(params, "mapId", options.mapId);
    setParam(params, "startDate", options.startDate);
    setParam(params, "endDate", options.endDate);
    if (options.isReserving !== false) params.set("isReserving", "true");
    const normalizedUrl = normalizeBookingUrlPath(baseUrl);
    const sep = normalizedUrl.includes("?") ? "&" : "?";
    return `${normalizedUrl}${sep}${params.toString()}`;
  }
}

export function buildOneNightBookingUrl(
  baseUrl: string,
  nightDate: string,
  options: Pick<BookingUrlOptions, "resourceId" | "mapId"> = {},
): string {
  return buildBookingUrl(baseUrl, {
    ...options,
    startDate: nightDate,
    endDate: addNights(nightDate, 1),
  });
}
