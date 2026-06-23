import type { CSSProperties } from "react";
import { mcpTableBackground } from "../../features/mcp/mcpTableStyles";
import { borders, colors, tamaguiSurfaces } from "../../theme";

export const PANE_TOOLBAR_GAP = 8;
export const PANE_TOOLBAR_ITEM_HEIGHT = 32;
export const PANE_TOOLBAR_ITEM_RADIUS = 10;
export const PANE_TOOLBAR_ICON_SIZE = 32;
export const PANE_TOOLBAR_DROPDOWN_MIN_WIDTH = 156;
export const PANE_TOOLBAR_CHIP_FILL = mcpTableBackground;
export const PANE_TOOLBAR_CHIP_BORDER = borders.default;

export const PANE_CHEVRON_TRANSITION = "transform 0.16s ease";
export const PANE_DISCLOSURE_TRANSITION = "transform 0.22s ease";

export const PANE_ROW_RADIUS = 12;
export const PANE_ROW_PADDING = 8;
export const PANE_ROW_MIN_HEIGHT = 28;
export const PANE_EXPANDED_MAX_HEIGHT = 280;

/** Create-row input shell and Cancel — same height. */
export const PANE_CREATE_CONTROL_HEIGHT = PANE_ROW_MIN_HEIGHT;
export const PANE_CREATE_CONTROL_RADIUS = 6;

export function paneToolbarButtonBase(disabled = false): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    border: `1px solid ${PANE_TOOLBAR_CHIP_BORDER}`,
    background: "transparent",
    color: "inherit",
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    flexShrink: 0,
  };
}

export function paneCreateControlShellStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    height: PANE_CREATE_CONTROL_HEIGHT,
    padding: "0 10px",
    borderRadius: PANE_CREATE_CONTROL_RADIUS,
    border: `1px solid ${tamaguiSurfaces.controlBorder}`,
    background: tamaguiSurfaces.controlBg,
    boxSizing: "border-box",
  };
}

export function paneCreateActionStyle(width = 62): CSSProperties {
  return {
    ...paneToolbarButtonBase(),
    width,
    height: PANE_CREATE_CONTROL_HEIGHT,
    borderRadius: PANE_CREATE_CONTROL_RADIUS,
    fontSize: 12,
    fontWeight: 500,
  };
}

export function paneToolbarSearchShellStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    height: PANE_TOOLBAR_ICON_SIZE,
    padding: "0 10px",
    borderRadius: PANE_TOOLBAR_ITEM_RADIUS,
    border: `1px solid ${tamaguiSurfaces.controlBorder}`,
    background: tamaguiSurfaces.controlBg,
    boxSizing: "border-box",
  };
}

export function paneToolbarIconButtonStyle(disabled = false): CSSProperties {
  return {
    ...paneToolbarButtonBase(disabled),
    width: PANE_TOOLBAR_ICON_SIZE,
    height: PANE_TOOLBAR_ICON_SIZE,
    padding: 0,
    border: "none",
    background: "transparent",
    color: colors.muted,
  };
}

export function paneCompactActionStyle(options?: {
  accent?: boolean;
  disabled?: boolean;
  minWidth?: number;
}): CSSProperties {
  const { accent = false, disabled = false, minWidth } = options ?? {};
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    height: 22,
    minWidth: minWidth ?? undefined,
    padding: "0 10px",
    borderRadius: 6,
    border: `1px solid ${accent && !disabled ? colors.accent : borders.faint}`,
    background: accent && !disabled ? colors.accent : "transparent",
    color: accent && !disabled ? "#fff" : colors.muted,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "inherit",
    lineHeight: 1,
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    flexShrink: 0,
  };
}

/** Graph pane: toolbar row inside rounded shell, separator before canvas. */
export function paneGraphToolbarStyle(): CSSProperties {
  return {
    padding: "8px 12px",
    borderBottom: `1px solid ${borders.faint}`,
    background: "transparent",
  };
}

export function paneGraphShellStyle(): CSSProperties {
  return {
    background: "transparent",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  };
}
