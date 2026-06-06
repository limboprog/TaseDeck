import type { ColorScheme } from "../theme";

export const COLOR_SCHEME_STORAGE_KEY = "tasedeck.colorScheme";

export function readColorSchemePreference(): ColorScheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return "light";
}

export function writeColorSchemePreference(scheme: ColorScheme): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme);
}
