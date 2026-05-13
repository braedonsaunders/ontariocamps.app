const APP_TIME_ZONE = "America/Toronto";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const APP_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function appDate(offsetDays = 0, from = new Date()): string {
  const date = new Date(from.getTime() + offsetDays * ONE_DAY_MS);
  const parts = APP_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Unable to format Ontario app date");
  return `${year}-${month}-${day}`;
}
