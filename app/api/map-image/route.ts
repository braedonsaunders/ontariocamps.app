import { NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set([
  "campspot-production.s3.amazonaws.com",
]);

const MAX_BYTES = 5 * 1024 * 1024;

function sniffImageContentType(bytes: Uint8Array, upstream: string | null): string | null {
  if (upstream?.toLowerCase().startsWith("image/")) return upstream;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";

  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 512))
    .trimStart()
    .toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
    return "image/svg+xml; charset=utf-8";
  }

  return null;
}

export async function GET(request: Request) {
  const rawSrc = new URL(request.url).searchParams.get("src");
  if (!rawSrc) return NextResponse.json({ error: "src is required" }, { status: 400 });

  let src: URL;
  try {
    src = new URL(rawSrc);
  } catch {
    return NextResponse.json({ error: "invalid src" }, { status: 400 });
  }

  if (src.protocol !== "https:" || !ALLOWED_HOSTS.has(src.hostname)) {
    return NextResponse.json({ error: "map image host is not allowed" }, { status: 400 });
  }

  const response = await fetch(src, {
    headers: { Accept: "image/*,*/*;q=0.8" },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response) return NextResponse.json({ error: "map image fetch failed" }, { status: 502 });
  if (!response.ok) return NextResponse.json({ error: "map image unavailable" }, { status: response.status });

  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "map image too large" }, { status: 413 });

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) return NextResponse.json({ error: "map image too large" }, { status: 413 });

  const bytes = new Uint8Array(buffer);
  const contentType = sniffImageContentType(bytes, response.headers.get("content-type"));
  if (!contentType) return NextResponse.json({ error: "unsupported map image" }, { status: 415 });

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "Content-Disposition": "inline",
    },
  });
}
