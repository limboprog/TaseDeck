import { IoChevronForward, IoClose } from "../../icons";
import type { TopologyEdge } from "../../services/topology";
import { colors, graph } from "../../theme";
import { worldToScreen, type Point } from "./graphGeometry";

type GraphEdgeControlProps = {
  edge: TopologyEdge;
  midpoint: Point;
  tangentAngle: number;
  pan: Point;
  zoom: number;
  hidden?: boolean;
  onToggle: (edgeId: string) => void;
};

export function GraphEdgeControl({
  edge,
  midpoint,
  tangentAngle,
  pan,
  zoom,
  hidden = false,
  onToggle,
}: GraphEdgeControlProps) {
  const enabled = edge.enabled !== false;

  if (hidden) {
    return null;
  }

  const screen = worldToScreen(midpoint, pan, zoom);
  const size = 28;

  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(edge.id);
      }}
      style={{
        position: "absolute",
        left: screen.x - size / 2,
        top: screen.y - size / 2,
        width: size,
        height: size,
        borderRadius: 999,
        border: enabled
          ? `1px solid ${graph.edgeControlBorder}`
          : `1px solid ${graph.edgeControlBorderDisabled}`,
        background: enabled ? graph.edgeControlBg : graph.edgeControlBgDisabled,
        color: enabled ? colors.foreground : colors.muted,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        zIndex: 5,
        boxShadow: graph.edgeControlShadow,
      }}
      aria-label={enabled ? "Disable connection" : "Enable connection"}
    >
      {enabled ? (
        <IoChevronForward
          size={14}
          style={{ transform: `rotate(${tangentAngle}deg)` }}
        />
      ) : (
        <IoClose size={14} />
      )}
    </button>
  );
}

export function edgeStrokeColor(enabled: boolean) {
  return enabled ? graph.wireActive : graph.wireInactive;
}
