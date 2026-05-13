export type ParkAlert = {
  title: string;
  type: string;
  message: string;
  location?: string | null;
  severity: "info" | "warning" | "danger";
  source_url: string;
};

const UA = "ontariocamps.app alert parser (+https://ontariocamps.app)";

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (_, name) => named[String(name).toLowerCase()] ?? `&${name};`);
}

function cleanText(value: string): string {
  return decodeEntities(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
      .replace(/\r\n?/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function normalize(value: string): string {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function severityFor(type: string, message: string): ParkAlert["severity"] {
  const text = `${type} ${message}`;
  if (/\b(?:fire ban|boil water|closure|closed|evacuat|prohibited)\b/i.test(type)) return "danger";
  if (/\b(?:fire ban|boil water|evacuat|do not drink|unsafe water|prohibited)\b/i.test(message)) return "danger";
  if (/\b(?:delayed|advisory|warning|notice|posting|unavailable|closure|closed|flood|not maintained)\b/i.test(text)) return "warning";
  return "info";
}

function rankedAlerts(alerts: ParkAlert[]): ParkAlert[] {
  const rank: Record<ParkAlert["severity"], number> = { danger: 0, warning: 1, info: 2 };
  return [...alerts].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function trustedSourceUrl(value: string | null | undefined, fallback: string, allowedHost: RegExp): string {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && allowedHost.test(url.hostname)) return url.toString();
  } catch {
    // Fall through to the trusted operator default.
  }
  return fallback;
}

function titleType(rawTitle: string): string {
  const title = cleanText(rawTitle)
    .replace(/\s*-\s*Custom Text\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = title.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : title;
}

function ontarioParkSlugCandidates(parkName: string): string[] {
  const cleaned = parkName
    .replace(/^Algonquin\s*[-–—]\s*.*/i, "Algonquin")
    .replace(/Provincial Park.*$/i, "")
    .replace(/\s*[-–—]\s*.*$/, "")
    .replace(/\(.*?\)/g, "")
    .trim();
  if (!cleaned) return [];
  const norm = cleaned
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim();
  const hyphen = norm.replace(/\s+/g, "-");
  const joined = norm.replace(/\s+/g, "");
  return Array.from(new Set([joined, hyphen]));
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html",
        "Accept-Language": "en-CA,en;q=0.9",
        "User-Agent": UA,
      },
      next: { revalidate: 30 * 60 },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function parseOntarioParkAlerts(html: string, sourceUrl: string): ParkAlert[] {
  const section = html.match(/<section[^>]+id=["']alerts["'][^>]*>([\s\S]*?)(?:<h2[^>]*>\s*Beach Postings\s*<\/h2>|<\/section>)/i)?.[1];
  if (!section) return [];

  const alerts: ParkAlert[] = [];
  const alertPattern = /<p[^>]*>\s*<img[^>]*alert-icon[^>]*>[\s\S]*?<strong>([\s\S]*?)<\/strong>\s*<\/p>\s*([\s\S]*?)(?=<p[^>]*>\s*<img[^>]*alert-icon|<h2|<\/section>)/gi;
  for (const match of section.matchAll(alertPattern)) {
    const type = titleType(match[1]);
    const message = cleanText(match[2]);
    if (!type || !message) continue;
    const locationMatch = message.match(/(?:^|\n)\s*Location:\s*([^-]+?)\s+-\s+(.+)$/is);
    const location = locationMatch ? locationMatch[1].trim() : null;
    const prefix = locationMatch && locationMatch.index != null ? message.slice(0, locationMatch.index).trim() : "";
    const locationBody = locationMatch ? locationMatch[2].trim() : "";
    const body = locationMatch ? [prefix, locationBody].filter(Boolean).join("\n\n") : message;
    alerts.push({
      title: type,
      type,
      message: body,
      location,
      severity: severityFor(type, body),
      source_url: sourceUrl,
    });
  }

  const beachSection = html.match(/<h2[^>]*>\s*Beach Postings\s*<\/h2>([\s\S]*?)(?:<\/table>|<\/section>)/i)?.[1];
  if (beachSection) {
    const rowPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<img[^>]+src=["']([^"']+)["'][\s\S]*?<\/tr>/gi;
    for (const match of beachSection.matchAll(rowPattern)) {
      const icon = match[3];
      if (/beach-posting-no/i.test(icon)) continue;
      const date = cleanText(match[1]);
      const beach = cleanText(match[2]);
      if (!beach) continue;
      alerts.push({
        title: "Beach posting",
        type: "Beach posting",
        message: `${beach}${date ? ` posted ${date}` : ""}. Check the official alert before swimming.`,
        location: beach,
        severity: "warning",
        source_url: sourceUrl,
      });
    }
  }

  return rankedAlerts(alerts).slice(0, 8);
}

function parseStLawrenceAlerts(html: string, sourceUrl: string, parkName: string): ParkAlert[] {
  const wanted = normalize(parkName);
  const alerts: ParkAlert[] = [];
  const pattern = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  for (const match of html.matchAll(pattern)) {
    const title = cleanText(match[1]);
    const message = cleanText(match[2]);
    if (!title || !message) continue;
    const text = normalize(`${title} ${message}`);
    if (wanted && !text.includes(wanted.split(" ").slice(0, 2).join(" "))) continue;
    alerts.push({
      title,
      type: "Alert",
      message,
      severity: severityFor(title, message),
      source_url: sourceUrl,
    });
  }
  return rankedAlerts(alerts).slice(0, 5);
}

export async function fetchParkAlerts(args: {
  operatorId: string;
  parkName: string;
  sourceUrl?: string | null;
}): Promise<{ alerts: ParkAlert[]; source_url: string | null; parsed: boolean }> {
  if (args.operatorId === "ontario_parks") {
    for (const slug of ontarioParkSlugCandidates(args.parkName)) {
      const sourceUrl = `https://www.ontarioparks.ca/park/${slug}/alerts`;
      const html = await fetchHtml(sourceUrl);
      if (!html || !/<h1[^>]*|Alerts/i.test(html) || /not found/i.test(html.slice(0, 800))) continue;
      return { alerts: parseOntarioParkAlerts(html, sourceUrl), source_url: sourceUrl, parsed: true };
    }
    return { alerts: [], source_url: "https://www.ontarioparks.ca/alerts", parsed: false };
  }

  if (args.operatorId === "st_lawrence_parks") {
    const sourceUrl = trustedSourceUrl(
      args.sourceUrl,
      "https://www.stlawrenceparks.com/alerts/",
      /(^|\.)stlawrenceparks\.com$/i,
    );
    const html = await fetchHtml(sourceUrl);
    return {
      alerts: html ? parseStLawrenceAlerts(html, sourceUrl, args.parkName) : [],
      source_url: sourceUrl,
      parsed: Boolean(html),
    };
  }

  return { alerts: [], source_url: args.sourceUrl ?? null, parsed: false };
}
