import { forwardRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { colors } from "../../theme";
import { ToolbarChevron } from "./ToolbarChevron";
import {
  TOOLBAR_DROPDOWN_MIN_WIDTH,
  TOOLBAR_ITEM_HEIGHT,
  TOOLBAR_ITEM_RADIUS,
  toolbarButtonBaseStyle,
} from "./toolbarStyles";

type ToolbarButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  active?: boolean;
  expanded?: boolean;
  showChevron?: boolean;
  minWidth?: number;
  height?: number;
  borderRadius?: number;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-expanded"?: boolean;
  "aria-pressed"?: boolean;
  "data-toolbar-interactive"?: boolean;
};

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton(
    {
      children,
      onClick,
      onPointerDown,
      disabled = false,
      active = false,
      expanded = false,
      showChevron = false,
      minWidth = TOOLBAR_DROPDOWN_MIN_WIDTH,
      height = TOOLBAR_ITEM_HEIGHT,
      borderRadius = TOOLBAR_ITEM_RADIUS,
      style,
      "aria-label": ariaLabel,
      "aria-expanded": ariaExpanded,
      "aria-pressed": ariaPressed,
      "data-toolbar-interactive": dataToolbarInteractive,
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={ariaExpanded}
        aria-pressed={ariaPressed}
        data-toolbar-interactive={dataToolbarInteractive ? "" : undefined}
        onClick={disabled ? undefined : onClick}
        onPointerDown={onPointerDown}
        style={{
          ...toolbarButtonBaseStyle(disabled),
          justifyContent: showChevron ? "space-between" : "center",
          gap: showChevron ? 10 : 8,
          minWidth: showChevron ? minWidth : undefined,
          width: showChevron ? undefined : height,
          height,
          padding: showChevron ? "0 12px" : 0,
          borderRadius,
          color: active ? colors.accent : colors.foreground,
          fontSize: 13,
          fontWeight: showChevron ? 400 : 500,
          ...style,
        }}
      >
        {children}
        {showChevron ? <ToolbarChevron expanded={expanded} /> : null}
      </button>
    );
  },
);
