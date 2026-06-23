/** Compact agent pill — ~25% of a typical row. */
export const PROJECT_AGENT_NODE_WIDTH = 148;
export const PROJECT_NODE_CONNECTOR_WIDTH = 22;
/** Preset + server column — preset right edge aligns with server cards. */
export const PROJECT_SERVER_COLUMN_WIDTH = 420;
export const PROJECT_PRESET_NODE_WIDTH = PROJECT_SERVER_COLUMN_WIDTH;
export const PROJECT_ROW_WIDTH =
  PROJECT_AGENT_NODE_WIDTH + PROJECT_NODE_CONNECTOR_WIDTH + PROJECT_SERVER_COLUMN_WIDTH;
/** Server tree in agent branch. */
export const PROJECT_SERVER_TREE_RAIL_WIDTH = 20;
export const PROJECT_SERVER_TREE_CONTENT_INDENT = PROJECT_SERVER_TREE_RAIL_WIDTH + 8;
/** Extra width for expanded server settings panel (extends right only). */
export const PROJECT_SERVER_EXPAND_RIGHT = 176;
/** Extra indent before agent nodes so git arcs are clearly visible. */
export const PROJECT_AGENT_BRANCH_INDENT = 40;

/** Compact sticky project header (title + undo/redo). */
export const PROJECT_HEADER_PADDING_TOP = 4;
export const PROJECT_HEADER_PADDING_BOTTOM = 10;
export const PROJECT_HEADER_ROW_HEIGHT = 18;
export const PROJECT_STICKY_HEADER_HEIGHT =
  PROJECT_HEADER_PADDING_TOP + PROJECT_HEADER_ROW_HEIGHT + PROJECT_HEADER_PADDING_BOTTOM;

/**
 * Keeps agent rows at the original offset after the header was compacted.
 * Was: paddingTop(4) + row(18) + paddingBottom(40) = 62.
 */
export const PROJECT_TREE_HEADER_SPACER =
  62 - PROJECT_STICKY_HEADER_HEIGHT;

/** Git trunk line starts under the sticky title and extends down through the spacer. */
export const PROJECT_TREE_TRUNK_START_Y = PROJECT_STICKY_HEADER_HEIGHT - 2;

/** Scroll spy + nav: keep agent rows below the sticky project header. */
export const PROJECT_NAV_SCROLL_GAP = 8;
export const PROJECT_NAV_SCROLL_OFFSET =
  PROJECT_STICKY_HEADER_HEIGHT + PROJECT_NAV_SCROLL_GAP;
