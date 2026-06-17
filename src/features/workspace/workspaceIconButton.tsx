import type { CSSProperties, ReactNode } from "react";
import { borders, colors } from "../../theme";
import {
  clearOpaqueShellHover,
  opaqueCommandFill,
  setOpaqueShellHover,
} from "./topologyTableInteraction";

type WorkspaceIconButtonProps = {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
};

/** Opaque chrome for graph / header controls (not alpha `mcpTableBackground`). */
export function workspaceIconButtonChrome(): CSSProperties {
  return {
    borderRadius: 8,
    border: `1px solid ${borders.default}`,
    background: opaqueCommandFill,
  };
}

/** 32×32 — opaque command surface, table-style hover overlay. */
export function WorkspaceIconButton({
  children,
  active = false,
  disabled = false,
  onPress,
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
}: WorkspaceIconButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      onClick={disabled ? undefined : onPress}
      onMouseEnter={(event) => {
        if (!disabled) {
          setOpaqueShellHover(event.currentTarget);
        }
      }}
      onMouseLeave={(event) => {
        clearOpaqueShellHover(event.currentTarget);
      }}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: `1px solid ${active ? borders.selected : borders.default}`,
        background: opaqueCommandFill,
        opacity: disabled ? 0.45 : 1,
        color: active ? colors.accent : colors.foreground,
        cursor: disabled ? "default" : "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
