import type { CSSProperties, ReactNode, MouseEvent } from "react";
import { colors } from "../../theme";
import { clearTableIconHover, setTableIconHover } from "./topologyTableInteraction";

type TopologyTableIconButtonProps = {
  children: ReactNode;
  onPress?: (event: MouseEvent<HTMLButtonElement>) => void;
  "aria-label": string;
  width?: number;
  style?: CSSProperties;
};

/** 28×28 (or custom) — transparent, hover `controlHoverBg` like MCP tables. */
export function TopologyTableIconButton({
  children,
  onPress,
  "aria-label": ariaLabel,
  width = 28,
  style,
}: TopologyTableIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onPress}
      onMouseEnter={(event) => setTableIconHover(event.currentTarget)}
      onMouseLeave={(event) => clearTableIconHover(event.currentTarget)}
      style={{
        width,
        height: 28,
        borderRadius: 6,
        border: "none",
        background: "transparent",
        color: colors.muted,
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
