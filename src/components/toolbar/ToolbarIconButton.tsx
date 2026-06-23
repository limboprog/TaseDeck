import type { ReactNode } from "react";
import { borders, colors } from "../../theme";
import { ToolbarButton } from "./ToolbarButton";
import { TOOLBAR_ICON_SIZE, TOOLBAR_ITEM_RADIUS } from "./toolbarStyles";

type ToolbarIconButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  "aria-label": string;
  "aria-pressed"?: boolean;
};

export function ToolbarIconButton({
  children,
  onClick,
  disabled = false,
  active = false,
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
}: ToolbarIconButtonProps) {
  return (
    <ToolbarButton
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      disabled={disabled}
      active={active}
      onClick={onClick}
      height={TOOLBAR_ICON_SIZE}
      borderRadius={TOOLBAR_ITEM_RADIUS}
      style={{
        width: TOOLBAR_ICON_SIZE,
        background: "transparent",
        borderColor: active ? borders.selected : borders.default,
        color: active ? colors.accent : colors.foreground,
      }}
    >
      {children}
    </ToolbarButton>
  );
}
