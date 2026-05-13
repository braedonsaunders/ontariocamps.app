const DEFAULT_IMAGE_PROXY_BASE = "https://ontariocamps-availability.bsaunders.workers.dev";

export type ImageProxyPreset = "card" | "thumb" | "strip" | "hero";

const imageProxyBase = (
  process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE ??
  DEFAULT_IMAGE_PROXY_BASE
).replace(/\/+$/, "");

const IMAGE_PROXY_ALLOWED_HOSTS = new Set([
  "images.unsplash.com",
  "reservations.ontarioparks.ca",
  "reservations.parks.on.ca",
  "reservation.pc.gc.ca",
  "www.grcacamping.ca",
  "camping.trca.ca",
  "www.ontarioparks.ca",
  "parks.canada.ca",
  "www.grandriver.ca",
  "trca.ca",
  "npca.ca",
  "www.scrca.on.ca",
  "www.otonabeeconservation.com",
  "www.lprca.on.ca",
  "www.stlawrenceparks.com",
  "hcareservations.ca",
  "images.campspot.com",
  "res.cloudinary.com",
  "s3.amazonaws.com",
  "ontarioconservationareas.ca",
  "mvca.on.ca",
]);

const IMAGE_PROXY_ALLOWED_SUFFIXES = [".goingtocamp.com"];

function isAllowedImageProxyHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return IMAGE_PROXY_ALLOWED_HOSTS.has(host) || IMAGE_PROXY_ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function imageProxyUrl(src: string | null | undefined, preset: ImageProxyPreset = "card"): string | null {
  if (!src) return null;
  let source: URL;
  try {
    source = new URL(src);
  } catch {
    return src;
  }
  if (source.protocol !== "https:" || !imageProxyBase) return src;
  if (!isAllowedImageProxyHost(source.hostname)) return src;

  const url = new URL("/image", imageProxyBase);
  url.searchParams.set("preset", preset);
  url.searchParams.set("src", source.toString());
  return url.toString();
}
