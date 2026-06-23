import type { CSSProperties } from "react";

type ToolbarEllipsisProps = {
  children: string;
  title?: string;
  style?: CSSProperties;
};

export function toolbarEllipsisStyle(): CSSProperties {
  return {
    display: "block",
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

export function ToolbarEllipsis({ children, title, style }: ToolbarEllipsisProps) {
  return (
    <span title={title ?? children} style={{ ...toolbarEllipsisStyle(), ...style }}>
      {children}
    </span>
  );
}
