const TZ = "Europe/Copenhagen";

export function formatDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("da-DK", { timeZone: TZ, ...opts }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  return formatDate(d, { dateStyle: "medium", timeStyle: "short" });
}

export function relativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = (date.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("da-DK", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(date);
}

export function formatNumber(n: number, digits = 0): string {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Stabil farveslot (1-8) ud fra et id — farven følger entiteten, ikke rækkefølgen. */
export function colorSlot(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 8) + 1;
}
