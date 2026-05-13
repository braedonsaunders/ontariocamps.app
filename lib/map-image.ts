import { isAllowedMapImageHost } from "@/lib/map-image-hosts";

export function mapImageUrl(src: string): string {
  try {
    const url = new URL(src);
    if (url.protocol === "https:" && isAllowedMapImageHost(url.hostname)) {
      return `/api/map-image?src=${encodeURIComponent(url.toString())}`;
    }
  } catch {
    return src;
  }
  return src;
}
