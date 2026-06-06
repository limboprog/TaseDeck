/** Parses usage log timestamps (unix sec, unix ms, or ISO) for display. */
export function formatUsageDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "—";
  }

  let ms: number;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const [whole, fraction = ""] = trimmed.split(".");
    const seconds = Number(whole);
    const millis = Number(fraction.padEnd(3, "0").slice(0, 3));
    if (!Number.isFinite(seconds)) {
      return raw;
    }
    ms = seconds < 1_000_000_000_000 ? seconds * 1000 + millis : seconds + millis;
  } else {
    ms = Date.parse(trimmed);
  }

  if (!Number.isFinite(ms)) {
    return raw;
  }

  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
