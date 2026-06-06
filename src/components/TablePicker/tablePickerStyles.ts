import type { CSSProperties } from "react";
import { mcpTableRowLine } from "../../features/mcp/mcpTableStyles";
import { accentAlpha, borders, colors, surfaces } from "../../theme";

export const tablePickerPanelShellStyle: CSSProperties = {
  position: "fixed",
  zIndex: 20000,
  background: colors.surface,
  borderTop: "none",
  borderLeft: `1px solid ${borders.default}`,
  borderRight: `1px solid ${borders.default}`,
  borderBottom: `1px solid ${borders.default}`,
  borderRadius: "0 0 8px 8px",
  overflow: "hidden",
  boxShadow: "none",
};

export const tablePickerPanelBodyStyle: CSSProperties = {
  background: surfaces.card,
  display: "flex",
  flexDirection: "column",
  maxHeight: 220,
  overflowY: "auto",
};

export function tablePickerItemStyle(isLast: boolean, selected: boolean): CSSProperties {
  return {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    textAlign: "left",
    padding: "8px 12px",
    border: "none",
    borderBottom: isLast ? "none" : mcpTableRowLine,
    background: selected ? accentAlpha[12] : "transparent",
    color: selected ? colors.accent : colors.foreground,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  };
}

export const tablePickerSelectTriggerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  minWidth: 0,
  height: 28,
  margin: 0,
  padding: 0,
  border: "none",
  background: "transparent",
  color: colors.foreground,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

export const tablePickerSearchInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 28,
  margin: 0,
  padding: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: colors.foreground,
  fontSize: 13,
  fontWeight: 500,
  fontFamily: "inherit",
};
