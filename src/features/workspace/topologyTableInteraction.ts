import { colors, tamaguiSurfaces } from "../../theme";
import { mcpTableBackground } from "../mcp/mcpTableStyles";

/** Opaque fill for graph toolbar — not `mcpTableBackground` (alpha). */
export const opaqueCommandFill = colors.commandSurface;

/** Icon on a table row — transparent, hover like `McpTableCells`. */
export function setTableIconHover(element: HTMLElement) {
  element.style.background = tamaguiSurfaces.controlHoverBg;
}

export function clearTableIconHover(element: HTMLElement) {
  element.style.background = "transparent";
}

/** Table list row shell — semi-transparent fill on solid pane. */
export function setTableShellHover(element: HTMLElement) {
  element.style.background = `linear-gradient(${tamaguiSurfaces.controlHoverBg}, ${tamaguiSurfaces.controlHoverBg}), ${mcpTableBackground}`;
}

export function clearTableShellHover(element: HTMLElement) {
  element.style.background = mcpTableBackground;
}

/** Graph toolbar / add control — opaque fill + table-style hover overlay. */
export function setOpaqueShellHover(element: HTMLElement) {
  element.style.background = `linear-gradient(${tamaguiSurfaces.controlHoverBg}, ${tamaguiSurfaces.controlHoverBg}), ${opaqueCommandFill}`;
}

export function clearOpaqueShellHover(element: HTMLElement) {
  element.style.background = opaqueCommandFill;
}
