import { IoClose } from "../../icons";
import { colors } from "../../theme";
import {
  TOOLBAR_CHIP_BORDER,
  TOOLBAR_CHIP_FILL,
  TOOLBAR_ITEM_HEIGHT,
  TOOLBAR_ITEM_RADIUS,
} from "./toolbarStyles";

type ToolbarChipProps = {
  label: string;
  onRemove: () => void;
  height?: number;
  borderRadius?: number;
};

export function ToolbarChip({
  label,
  onRemove,
  height = TOOLBAR_ITEM_HEIGHT,
  borderRadius = TOOLBAR_ITEM_RADIUS,
}: ToolbarChipProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height,
        paddingLeft: 12,
        paddingRight: 8,
        borderRadius,
        border: `1px solid ${TOOLBAR_CHIP_BORDER}`,
        background: TOOLBAR_CHIP_FILL,
        color: colors.foreground,
        fontSize: 13,
        fontWeight: 400,
        flexShrink: 0,
        boxSizing: "border-box",
      }}
    >
      <span style={{ lineHeight: 1 }}>{label}</span>
      <button
        type="button"
        data-toolbar-interactive
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          padding: 0,
          border: "none",
          borderRadius: 4,
          background: "transparent",
          color: colors.muted,
          cursor: "pointer",
        }}
      >
        <IoClose size={12} />
      </button>
    </span>
  );
}
