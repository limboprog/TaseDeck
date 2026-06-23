import { IoChevronDown } from "../../icons";
import { colors } from "../../theme";
import { TOOLBAR_CHEVRON_TRANSITION, TOOLBAR_DISCLOSURE_TRANSITION } from "./toolbarStyles";

type ToolbarChevronProps = {
  expanded: boolean;
  size?: number;
  variant?: "dropdown" | "disclosure";
};

export function ToolbarChevron({
  expanded,
  size = 14,
  variant = "dropdown",
}: ToolbarChevronProps) {
  const transition =
    variant === "disclosure" ? TOOLBAR_DISCLOSURE_TRANSITION : TOOLBAR_CHEVRON_TRANSITION;

  const transform =
    variant === "disclosure"
      ? expanded
        ? "rotate(0deg)"
        : "rotate(-90deg)"
      : expanded
        ? "rotate(180deg)"
        : "rotate(0deg)";

  return (
    <IoChevronDown
      size={size}
      color={colors.muted}
      style={{
        flexShrink: 0,
        transition,
        transform,
      }}
    />
  );
}
