const MAP_IMAGE_ALLOWED_HOSTS = new Set([
  "campspot-production.s3.amazonaws.com",
  "camping.trca.ca",
  "hcareservations.ca",
  "images.campspot.com",
  "reservation.pc.gc.ca",
  "reservations.ontarioparks.ca",
  "reservations.parks.on.ca",
  "res.cloudinary.com",
  "s3.amazonaws.com",
  "www.camplife.com",
  "www.grcacamping.ca",
]);

const MAP_IMAGE_ALLOWED_SUFFIXES = [".goingtocamp.com"];

export function isAllowedMapImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return MAP_IMAGE_ALLOWED_HOSTS.has(host) || MAP_IMAGE_ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
