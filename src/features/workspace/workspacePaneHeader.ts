import { blocks } from "../../theme";

/** Shared header bar for workspace split panes (topology list, graph, MCP detail). */
export const WORKSPACE_PANE_HEADER_HEIGHT = blocks.paneHeader.height;

export const workspacePaneHeaderStyle = {
  ...blocks.paneHeader,
  borderBottom: "none",
} satisfies typeof blocks.paneHeader;
