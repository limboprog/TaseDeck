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
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ] as const;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${months[date.getMonth()]} ${date.getDate()} at ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatUsageToolLabel(toolName: string): string {
  const trimmed = toolName.trim();
  if (!trimmed) {
    return "—";
  }
  if (/\bcall$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} call`;
}

export const USER_CALLER_VALUE = "user";

export function formatUsageCaller(caller: string): string {
  const trimmed = caller.trim();
  if (!trimmed || trimmed.toLowerCase() === USER_CALLER_VALUE) {
    return "User";
  }
  return trimmed;
}

export function normalizeUsageCaller(caller: string): string {
  const trimmed = caller.trim();
  return trimmed ? trimmed.toLowerCase() : USER_CALLER_VALUE;
}
