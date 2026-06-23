import type { CSSProperties, ReactNode } from "react";
import { PANE_TOOLBAR_GAP } from "./paneStyles";

type PaneToolbarProps = {
  children: ReactNode;
  style?: CSSProperties;
};

export function PaneToolbar({ children, style }: PaneToolbarProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: PANE_TOOLBAR_GAP,
        flexShrink: 0,
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
