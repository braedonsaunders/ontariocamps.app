export type SvgAnchor = { x: number; y: number };

export type ParsedSvgMap = {
  width: number;
  height: number;
  anchors: Map<string, SvgAnchor>;
};

const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 1000;

function attrsFor(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1]] = match[2] ?? match[3] ?? "";
  }
  return attrs;
}

function numberFrom(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pointNumbers(value: string | null | undefined): number[] {
  if (!value) return [];
  return (value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [])
    .map((n) => Number.parseFloat(n))
    .filter((n) => Number.isFinite(n));
}

function centerFromPoints(numbers: number[]): SvgAnchor | null {
  if (numbers.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    const x = numbers[i];
    const y = numbers[i + 1];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function centerForElement(tagName: string, attrs: Record<string, string>): SvgAnchor | null {
  if (tagName === "circle" || tagName === "ellipse") {
    const x = numberFrom(attrs.cx);
    const y = numberFrom(attrs.cy);
    return x != null && y != null ? { x, y } : null;
  }

  if (tagName === "rect") {
    const x = numberFrom(attrs.x) ?? 0;
    const y = numberFrom(attrs.y) ?? 0;
    const width = numberFrom(attrs.width);
    const height = numberFrom(attrs.height);
    return width != null && height != null ? { x: x + width / 2, y: y + height / 2 } : null;
  }

  if (tagName === "polygon" || tagName === "polyline") {
    return centerFromPoints(pointNumbers(attrs.points));
  }

  if (tagName === "path") {
    return centerFromPoints(pointNumbers(attrs.d));
  }

  return null;
}

function parseDimensions(svg: string): { width: number; height: number } {
  const svgTag = svg.match(/<svg\b[\s\S]*?>/i)?.[0];
  if (!svgTag) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  const attrs = attrsFor(svgTag);
  const viewBox = pointNumbers(attrs.viewBox ?? attrs.viewbox);
  if (viewBox.length >= 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: viewBox[2], height: viewBox[3] };
  }
  return {
    width: numberFrom(attrs.width) ?? DEFAULT_WIDTH,
    height: numberFrom(attrs.height) ?? DEFAULT_HEIGHT,
  };
}

export function parseSvgMap(svg: string): ParsedSvgMap {
  const { width, height } = parseDimensions(svg);
  const anchors = new Map<string, SvgAnchor>();

  for (const match of svg.matchAll(/<(circle|ellipse|rect|polygon|polyline|path)\b[^>]*>/gi)) {
    const tagName = match[1].toLowerCase();
    const attrs = attrsFor(match[0]);
    const id = attrs.id?.trim();
    if (!id) continue;
    const center = centerForElement(tagName, attrs);
    if (center) anchors.set(id, center);
  }

  return { width, height, anchors };
}

export async function fetchSvgMap(url: string): Promise<ParsedSvgMap | null> {
  const response = await fetch(url, {
    headers: { Accept: "image/svg+xml,image/*,*/*;q=0.8" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return null;

  const text = await response.text();
  const head = text.trimStart().slice(0, 512).toLowerCase();
  if (!head.startsWith("<svg") && !(head.startsWith("<?xml") && head.includes("<svg"))) return null;

  return parseSvgMap(text);
}
