/** Right inset so preset tree cards align with the picker layout width. */
export const PRESET_TREE_CARD_RIGHT_GUTTER = 44;

export const presetTreeCardWidthStyle = {
  width: `calc(100% - ${PRESET_TREE_CARD_RIGHT_GUTTER}px)`,
  maxWidth: "100%",
} as const;
