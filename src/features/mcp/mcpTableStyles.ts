import type { CSSProperties } from "react";
import { blackAlpha, blocks, borders, colors, surfaces } from "../../theme";

/** Divider between table rows and picker items. */
export const mcpTableRowLine = blocks.commandTerminalHeader.borderBottom;

/** Row separator; omit on the last body row so only `mcpBlackBlock` draws the bottom edge. */
export function mcpTableRowBorder(isLastRow: boolean): CSSProperties {
  return { borderBottom: isLastRow ? "none" : mcpTableRowLine };
}

/** Fill for MCP command tables and transport picker (same token). */
export const mcpTableBackground = surfaces.command;

/** Env table, run commands shell, nested bash/args, tools — black command surface only. */
export const mcpBlackBlock: CSSProperties = {
  borderRadius: 8,
  border: `1px solid ${borders.default}`,
  background: mcpTableBackground,
  overflow: "hidden",
};

export const mcpRunCommandsPanel: CSSProperties = {
  ...mcpBlackBlock,
};

/** stdio / SSE / streamable-http — same border weight as outer MCP card. */
export const mcpTransportBlock: CSSProperties = {
  borderRadius: 8,
  border: `2px solid ${colors.glassBorder}`,
  background: surfaces.inset,
  overflow: "hidden",
};

export const mcpTransportTitleText: CSSProperties = {
  color: colors.muted,
  fontSize: 11,
  fontWeight: 500,
};

export function mcpTransportRadioStyle(checked: boolean): CSSProperties {
  return {
    width: 16,
    height: 16,
    margin: 0,
    flexShrink: 0,
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
    borderRadius: "50%",
    border: `2px solid ${checked ? colors.accent : borders.faint}`,
    background: surfaces.command,
    outline: "none",
  };
}

export const mcpTableCellPad: CSSProperties = {
  padding: "8px 12px",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
};

export const mcpTableHeaderCell: CSSProperties = {
  ...mcpTableCellPad,
  borderBottom: mcpTableRowLine,
};

export const mcpTableBodyCell: CSSProperties = {
  ...mcpTableCellPad,
  borderBottom: mcpTableRowLine,
};

export const mcpTableHeaderText: CSSProperties = {
  color: colors.muted,
  fontSize: 11,
  fontWeight: 400,
};

export const mcpSubsectionLabel: CSSProperties = {
  color: colors.muted,
  fontSize: 11,
  fontWeight: 500,
  display: "block",
};

export const mcpTableAddButton: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  border: "none",
  background: "transparent",
  color: colors.muted,
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
  padding: 0,
};

/** Transport picker overlay — same fill as command tables. */
export function mcpTransportPickerPanelStyle(): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    padding: 0,
    background: mcpTableBackground,
    borderLeft: `1px solid ${borders.default}`,
    borderRight: `1px solid ${borders.default}`,
    borderBottom: `1px solid ${borders.default}`,
    borderTop: "none",
    borderRadius: "0 0 8px 8px",
    overflow: "hidden",
    boxShadow: [
      `0 2px 6px ${blackAlpha[35]}`,
      `0 10px 28px ${blackAlpha[32]}`,
      `0 18px 48px ${blackAlpha[32]}`,
    ].join(", "),
  };
}

export function mcpTransportPickerItemStyle(isLast: boolean): CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "8px 12px",
    margin: 0,
    border: "none",
    borderBottom: isLast ? "none" : `1px solid ${borders.default}`,
    background: "transparent",
    color: colors.foreground,
    fontSize: 12,
    fontWeight: 400,
    cursor: "pointer",
  };
}

export const mcpTableExpandButton: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  flexShrink: 0,
  border: "none",
  borderRadius: 4,
  background: "transparent",
  color: colors.muted,
  cursor: "pointer",
  padding: 0,
};

export const mcpProfileHeaderRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 12px",
  borderBottom: mcpTableRowLine,
};

export const mcpNestedContent: CSSProperties = {
  padding: "0 12px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
