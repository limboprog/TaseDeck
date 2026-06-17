import type { CSSProperties } from "react";
import { borders } from "../../theme";
import { mcpBlackBlock, mcpTableBackground } from "../mcp/mcpTableStyles";

/** Same shell as MCP command tables (`mcpBlackBlock`). */
export function topologyRowChrome(selected: boolean): CSSProperties {
  return {
    ...mcpBlackBlock,
    background: mcpTableBackground,
    borderColor: selected ? borders.selected : borders.default,
  };
}

/** Row hover — border only, same idea as `InstalledMcpCard`. */
export const topologyRowHoverStyle = {
  borderColor: borders.focus,
} as const;
