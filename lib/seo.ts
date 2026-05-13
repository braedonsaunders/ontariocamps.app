export const SITE_NAME = "ontariocamps.app";
export const SITE_DESCRIPTION =
  "Search Ontario campsite availability across Ontario Parks, Parks Canada, and Conservation Authorities in one place.";

function normalizeSiteUrl(rawUrl: string | undefined): string {
  const fallback = "https://ontariocamps.app";
  const candidate = (rawUrl || fallback).trim();
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    const url = new URL(withProtocol);
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

export const SITE_URL = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL,
);

export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}

export function toMetaDescription(input: string | null | undefined, fallback: string, maxLength = 155): string {
  const normalized = (input || fallback).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const trimmed = normalized.slice(0, maxLength - 3);
  const lastSpace = trimmed.lastIndexOf(" ");
  return `${trimmed.slice(0, lastSpace > 80 ? lastSpace : trimmed.length).trim()}...`;
}

