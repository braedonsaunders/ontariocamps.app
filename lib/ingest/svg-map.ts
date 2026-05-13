export type SvgAnchor = { x: number; y: number };

export type ParsedSvgMap = {
  width: number;
  height: number;
  anchors: Map<string, SvgAnchor>;
};

type Matrix = [number, number, number, number, number, number];

const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 1000;
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

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

function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function transformPoint(point: SvgAnchor, matrix: Matrix): SvgAnchor {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}

function parseTransform(value: string | null | undefined): Matrix {
  if (!value) return IDENTITY;
  let matrix: Matrix = IDENTITY;
  for (const match of value.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/gi)) {
    const kind = match[1].toLowerCase();
    const nums = pointNumbers(match[2]);
    let next: Matrix = IDENTITY;
    if (kind === "matrix" && nums.length >= 6) {
      next = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]];
    } else if (kind === "translate") {
      next = [1, 0, 0, 1, nums[0] ?? 0, nums[1] ?? 0];
    } else if (kind === "scale") {
      const sx = nums[0] ?? 1;
      next = [sx, 0, 0, nums[1] ?? sx, 0, 0];
    } else if (kind === "rotate" && nums.length >= 1) {
      const angle = nums[0] * Math.PI / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rotate: Matrix = [cos, sin, -sin, cos, 0, 0];
      if (nums.length >= 3) {
        next = multiplyMatrix(
          multiplyMatrix([1, 0, 0, 1, nums[1], nums[2]], rotate),
          [1, 0, 0, 1, -nums[1], -nums[2]],
        );
      } else {
        next = rotate;
      }
    }
    matrix = multiplyMatrix(matrix, next);
  }
  return matrix;
}

function centerFromPoints(points: SvgAnchor[]): SvgAnchor | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function pointsFromRawPairs(numbers: number[]): SvgAnchor[] {
  const points: SvgAnchor[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return points;
}

function pathPoints(d: string | null | undefined): SvgAnchor[] {
  if (!d) return [];
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const points: SvgAnchor[] = [];
  let i = 0;
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;

  const isCommand = (token: string | undefined) => Boolean(token && /^[A-Za-z]$/.test(token));
  const read = () => Number.parseFloat(tokens[i++]);
  const hasNumber = () => i < tokens.length && !isCommand(tokens[i]);
  const addPoint = (px: number, py: number) => {
    if (Number.isFinite(px) && Number.isFinite(py)) points.push({ x: px, y: py });
  };
  const point = (relative: boolean, px: number, py: number) => ({
    x: relative ? x + px : px,
    y: relative ? y + py : py,
  });

  while (i < tokens.length) {
    if (isCommand(tokens[i])) command = tokens[i++];
    if (!command) break;
    const relative = command === command.toLowerCase();
    const cmd = command.toUpperCase();

    if (cmd === "M") {
      let first = true;
      while (hasNumber()) {
        const p = point(relative, read(), read());
        x = p.x;
        y = p.y;
        if (first) {
          startX = x;
          startY = y;
          first = false;
        }
        addPoint(x, y);
        if (isCommand(tokens[i])) break;
      }
      command = relative ? "l" : "L";
    } else if (cmd === "L") {
      while (hasNumber()) {
        const p = point(relative, read(), read());
        x = p.x;
        y = p.y;
        addPoint(x, y);
      }
    } else if (cmd === "H") {
      while (hasNumber()) {
        x = relative ? x + read() : read();
        addPoint(x, y);
      }
    } else if (cmd === "V") {
      while (hasNumber()) {
        y = relative ? y + read() : read();
        addPoint(x, y);
      }
    } else if (cmd === "C") {
      while (hasNumber()) {
        const c1 = point(relative, read(), read());
        const c2 = point(relative, read(), read());
        const end = point(relative, read(), read());
        addPoint(c1.x, c1.y);
        addPoint(c2.x, c2.y);
        x = end.x;
        y = end.y;
        addPoint(x, y);
      }
    } else if (cmd === "S" || cmd === "Q") {
      while (hasNumber()) {
        const c = point(relative, read(), read());
        const end = point(relative, read(), read());
        addPoint(c.x, c.y);
        x = end.x;
        y = end.y;
        addPoint(x, y);
      }
    } else if (cmd === "T") {
      while (hasNumber()) {
        const end = point(relative, read(), read());
        x = end.x;
        y = end.y;
        addPoint(x, y);
      }
    } else if (cmd === "A") {
      while (hasNumber()) {
        read();
        read();
        read();
        read();
        read();
        const end = point(relative, read(), read());
        x = end.x;
        y = end.y;
        addPoint(x, y);
      }
    } else if (cmd === "Z") {
      x = startX;
      y = startY;
      addPoint(x, y);
    } else {
      while (hasNumber()) i += 1;
    }
  }

  return points;
}

function centerForElement(tagName: string, attrs: Record<string, string>, matrix: Matrix): SvgAnchor | null {
  let center: SvgAnchor | null = null;

  if (tagName === "circle" || tagName === "ellipse") {
    const x = numberFrom(attrs.cx);
    const y = numberFrom(attrs.cy);
    center = x != null && y != null ? { x, y } : null;
  }

  if (!center && tagName === "rect") {
    const x = numberFrom(attrs.x) ?? 0;
    const y = numberFrom(attrs.y) ?? 0;
    const width = numberFrom(attrs.width);
    const height = numberFrom(attrs.height);
    center = width != null && height != null ? { x: x + width / 2, y: y + height / 2 } : null;
  }

  if (!center && (tagName === "polygon" || tagName === "polyline")) {
    center = centerFromPoints(pointsFromRawPairs(pointNumbers(attrs.points)));
  }

  if (!center && tagName === "path") {
    center = centerFromPoints(pathPoints(attrs.d));
  }

  return center ? transformPoint(center, matrix) : null;
}

function parseDimensions(svg: string): { minX: number; minY: number; width: number; height: number } {
  const svgTag = svg.match(/<svg\b[\s\S]*?>/i)?.[0];
  if (!svgTag) return { minX: 0, minY: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  const attrs = attrsFor(svgTag);
  const viewBox = pointNumbers(attrs.viewBox ?? attrs.viewbox);
  if (viewBox.length >= 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    return { minX: viewBox[0], minY: viewBox[1], width: viewBox[2], height: viewBox[3] };
  }
  return {
    minX: 0,
    minY: 0,
    width: numberFrom(attrs.width) ?? DEFAULT_WIDTH,
    height: numberFrom(attrs.height) ?? DEFAULT_HEIGHT,
  };
}

export function parseSvgMap(svg: string): ParsedSvgMap {
  const { minX, minY, width, height } = parseDimensions(svg);
  const anchors = new Map<string, SvgAnchor>();
  const stack: Matrix[] = [IDENTITY];

  for (const match of svg.matchAll(/<\/?([A-Za-z][\w:.-]*)\b[^>]*\/?>/g)) {
    const fullTag = match[0];
    if (fullTag.startsWith("</")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const tagName = match[1].toLowerCase();
    const attrs = attrsFor(fullTag);
    const parent = stack[stack.length - 1] ?? IDENTITY;
    const matrix = multiplyMatrix(parent, parseTransform(attrs.transform));
    const id = attrs.id?.trim();
    const isShape = tagName === "circle" || tagName === "ellipse" || tagName === "rect"
      || tagName === "polygon" || tagName === "polyline" || tagName === "path";
    if (id && isShape) {
      const center = centerForElement(tagName, attrs, matrix);
      if (center) anchors.set(id, { x: center.x - minX, y: center.y - minY });
    }
    if (!fullTag.endsWith("/>")) stack.push(matrix);
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
