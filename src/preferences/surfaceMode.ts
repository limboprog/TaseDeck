export const LIQUID_GLASS_STORAGE_KEY = "tasedeck.liquidGlass";

export function readLiquidGlassPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(LIQUID_GLASS_STORAGE_KEY) === "true";
}

export function writeLiquidGlassPreference(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LIQUID_GLASS_STORAGE_KEY, String(enabled));
}
