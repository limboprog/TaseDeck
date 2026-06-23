import { useEffect, useRef, useState, type CSSProperties } from "react";

const DEFAULT_LINE_HEIGHT = 20;
const DEFAULT_MIN_HEIGHT = 28;

type PaneExpandableTextProps = {
  value: string;
  expanded?: boolean;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  monospace?: boolean;
  lineHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  title?: string;
  style?: CSSProperties;
};

export function PaneExpandableText({
  value,
  expanded = false,
  color,
  fontSize = 13,
  fontWeight,
  monospace = false,
  lineHeight = DEFAULT_LINE_HEIGHT,
  minHeight = DEFAULT_MIN_HEIGHT,
  maxHeight,
  title,
  style,
}: PaneExpandableTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const collapsedLine = value.split("\n")[0] ?? "";
  const textPadY = (minHeight - lineHeight) / 2;

  useEffect(() => {
    const node = ref.current;
    if (!node || expanded) {
      setOverflows(false);
      return;
    }
    setOverflows(value.includes("\n") || node.scrollWidth > node.clientWidth + 1);
  }, [expanded, value, collapsedLine]);

  useEffect(() => {
    const node = ref.current;
    if (!node || expanded) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setOverflows(value.includes("\n") || node.scrollWidth > node.clientWidth + 1);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded, value]);

  return (
    <span
      ref={ref}
      title={title ?? (overflows && !expanded ? value : undefined)}
      style={{
        display: "block",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        color,
        fontSize,
        fontWeight,
        lineHeight: `${lineHeight}px`,
        fontFamily: monospace ? "ui-monospace, monospace" : "inherit",
        paddingTop: textPadY,
        minHeight,
        ...(expanded
          ? {
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight,
              overflow: maxHeight ? "auto" : undefined,
            }
          : {
              height: minHeight,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }),
        ...style,
      }}
    >
      {expanded ? value : collapsedLine}
    </span>
  );
}

export function paneEllipsisStyle(): CSSProperties {
  return {
    display: "block",
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

export function PaneEllipsis({
  children,
  title,
  style,
}: {
  children: string;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <span title={title ?? children} style={{ ...paneEllipsisStyle(), ...style }}>
      {children}
    </span>
  );
}
