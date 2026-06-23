import type { NavId } from "../components/Sidebar/Sidebar";

/** Set to true to show Dashboard in the sidebar and allow navigation to it. */
export const DASHBOARD_ENABLED = false;

/** Presets are managed inside project agent branches. */
export const PRESETS_ENABLED = false;

export const DEFAULT_NAV_ID: NavId = DASHBOARD_ENABLED
  ? "dashboard"
  : PRESETS_ENABLED
    ? "presets"
    : "mcp";

export function resolveNavId(navId: NavId): NavId {
  if (!DASHBOARD_ENABLED && navId === "dashboard") {
    return DEFAULT_NAV_ID;
  }
  if (!PRESETS_ENABLED && navId === "presets") {
    return DEFAULT_NAV_ID;
  }
  return navId;
}
