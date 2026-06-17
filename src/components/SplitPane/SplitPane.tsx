import { useCallback, useRef, useState, type ReactNode } from "react";
import { tamaguiSurfaces } from "../../theme";

type SplitPaneProps = {
  left: ReactNode;
  right: ReactNode;
  defaultRightRatio?: number;
  minLeft?: number;
  minRight?: number;
};

export function SplitPane({
  left,
  right,
  defaultRightRatio = 0.75,
  minLeft = 220,
  minRight = 320,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rightRatio, setRightRatio] = useState(defaultRightRatio);
  const draggingRef = useRef(false);

  const onPointerMove = useCallback((event: PointerEvent) => {
    if (!draggingRef.current || !containerRef.current) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const rightWidth = rect.right - event.clientX;
    const nextRatio = rightWidth / rect.width;
    const maxRatio = (rect.width - minLeft) / rect.width;
    const minRatio = minRight / rect.width;
    setRightRatio(Math.min(maxRatio, Math.max(minRatio, nextRatio)));
  }, [minLeft, minRight]);

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDragging);
  }, [onPointerMove]);

  const startDragging = () => {
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDragging);
  };

  const leftRatio = 1 - rightRatio;

  return (
    <div
      ref={containerRef}
      className="td-clip"
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: "100%",
      }}
    >
      <div
        className="td-clip td-stack"
        style={{
          width: `${leftRatio * 100}%`,
          minWidth: minLeft,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {left}
      </div>

      <div
        onPointerDown={startDragging}
        style={{
          width: 1,
          cursor: "col-resize",
          flexShrink: 0,
          marginLeft: 5,
          marginRight: 5,
          userSelect: "none",
          WebkitUserSelect: "none",
          background: tamaguiSurfaces.controlHoverBg,
          // borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
          // borderRight: "1px solid rgba(255, 255, 255, 0.08)",
          
        }}
      />

      <div
        className="td-clip td-stack"
        style={{
          width: `${rightRatio * 100}%`,
          minWidth: minRight,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {right}
      </div>
    </div>
  );
}
