/** Shared sidebar nav metrics — keep NavButton and SidebarNavGroup aligned. */
export const SIDEBAR_WIDTH_EXPANDED = 200;
export const SIDEBAR_WIDTH_COLLAPSED = 56;
export const SIDEBAR_PAD_X_EXPANDED = 12;
export const SIDEBAR_PAD_X_COLLAPSED = 8;
export const SIDEBAR_ICON_LEFT = 19;
export const COLLAPSE_TOGGLE_RIGHT_GUTTER = 12;

export const SIDEBAR_NAV_ITEM_PY = 8;
export const SIDEBAR_NAV_ITEM_GAP = 2;
/** Extra space before/after a collapsible nav block next to flat items. */
export const SIDEBAR_NAV_BLOCK_GAP = 10;

export const SIDEBAR_NAV_GROUP_CHEVRON_WIDTH = 14;
export const SIDEBAR_NAV_GROUP_HEADER_GAP = 6;

export function sidebarPadX(collapsed: boolean) {
  return collapsed ? SIDEBAR_PAD_X_COLLAPSED : SIDEBAR_PAD_X_EXPANDED;
}

export function iconButtonPadLeft(collapsed: boolean) {
  return SIDEBAR_ICON_LEFT - sidebarPadX(collapsed);
}

export function collapseToggleTranslateX(collapsed: boolean) {
  if (collapsed) {
    return 0;
  }
  const padX = SIDEBAR_PAD_X_EXPANDED;
  const contentWidth = SIDEBAR_WIDTH_EXPANDED - 2 * padX;
  const baseLeft = iconButtonPadLeft(false);
  const targetLeft = contentWidth - 18 - COLLAPSE_TOGGLE_RIGHT_GUTTER;
  return targetLeft - baseLeft;
}
