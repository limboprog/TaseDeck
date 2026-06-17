import type { CSSProperties } from "react";
import { borders } from "../../theme";
import { MCP_CARD_HEADER_Z_INDEX, MCP_LIST_STICKY_TOP } from "./mcpScrollLayout";

/** Matches GlassPanel / McpPanel corner radius. */
export const MCP_CARD_RADIUS = 12;

export function mcpExpandedCardCapStyle(
  borderColor: string,
  surface: CSSProperties,
): CSSProperties {
  const cardBorder = `1px solid ${borderColor}`;
  return {
    position: "sticky",
    top: MCP_LIST_STICKY_TOP,
    zIndex: MCP_CARD_HEADER_Z_INDEX,
    borderTop: cardBorder,
    borderLeft: cardBorder,
    borderRight: cardBorder,
    borderBottom: `1px solid ${borders.faint}`,
    borderTopLeftRadius: MCP_CARD_RADIUS,
    borderTopRightRadius: MCP_CARD_RADIUS,
    ...surface,
  };
}

export function mcpExpandedCardBodyStyle(
  borderColor: string,
  surface: CSSProperties,
): CSSProperties {
  const cardBorder = `1px solid ${borderColor}`;
  return {
    position: "relative",
    zIndex: 0,
    borderLeft: cardBorder,
    borderRight: cardBorder,
    borderBottom: cardBorder,
    borderBottomLeftRadius: MCP_CARD_RADIUS,
    borderBottomRightRadius: MCP_CARD_RADIUS,
    ...surface,
  };
}
