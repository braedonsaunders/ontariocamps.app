const DEFAULT_IMAGE_PROXY_BASE = "https://ontariocamps-availability.bsaunders.workers.dev";

export type ImageProxyPreset = "card" | "thumb" | "strip" | "hero";

const imageProxyBase = (
  process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE ??
  DEFAULT_IMAGE_PROXY_BASE
).replace(/\/+$/, "");

export function imageProxyUrl(src: string | null | undefined, preset: ImageProxyPreset = "card"): string | null {
  if (!src) return null;
  let source: URL;
  try {
    source = new URL(src);
  } catch {
    return src;
  }
  if (source.protocol !== "https:" || !imageProxyBase) return src;

  const url = new URL("/image", imageProxyBase);
  url.searchParams.set("preset", preset);
  url.searchParams.set("src", source.toString());
  return url.toString();
}
