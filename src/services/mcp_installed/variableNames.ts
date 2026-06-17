import { headerNameFromConfigKey } from "./storedHeaders";

/** Display/storage name only — strips `env:` / legacy `header:N:` prefixes. */
export function normalizeEnvVariableName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("env:")) {
    return trimmed.slice(4).trim();
  }
  const fromHeader = headerNameFromConfigKey(trimmed.startsWith("header:") ? trimmed : `header:${trimmed}`);
  if (fromHeader && /^\d+:/.test(trimmed.replace(/^header:/, ""))) {
    return fromHeader;
  }
  return trimmed;
}

export function canonicalEnvId(name: string): string {
  return `env:${normalizeEnvVariableName(name)}`;
}
