import { imageProxyUrl } from "@/lib/image-proxy";

const MAP_IMAGE_PROXY_HOSTS = new Set([
  "campspot-production.s3.amazonaws.com",
  "www.camplife.com",
]);

export function mapImageUrl(src: string): string {
  try {
    const url = new URL(src);
    const proxied = imageProxyUrl(url.toString(), "hero");
    if (proxied && proxied !== url.toString()) return proxied;
    if (url.protocol === "https:" && MAP_IMAGE_PROXY_HOSTS.has(url.hostname)) {
      return `/api/map-image?src=${encodeURIComponent(url.toString())}`;
    }
  } catch {
    return src;
  }
  return src;
}
