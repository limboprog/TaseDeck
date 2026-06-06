import type { TopologyNodeType } from "../../services/topology";
import { tamaguiSurfaces } from "../../theme";
import {
  mcpTransportPickerItemStyle,
  mcpTransportPickerPanelStyle,
} from "../mcp/mcpTableStyles";

type AddNodeSidePanelProps = {
  open: boolean;
  onPickType: (type: TopologyNodeType) => void;
};

const OPTIONS: { type: TopologyNodeType; label: string }[] = [
  { type: "agent", label: "Agent" },
  { type: "mcp", label: "MCP" },
];

export function AddNodeSidePanel({ open, onPickType }: AddNodeSidePanelProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 48,
        left: 52,
        zIndex: 25,
        width: 108,
        overflow: "hidden",
        maxHeight: open ? 120 : 0,
        opacity: open ? 1 : 0,
        transition: "max-height 0.22s ease, opacity 0.18s ease",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      <div style={mcpTransportPickerPanelStyle()}>
        {OPTIONS.map((option, index) => (
          <button
            key={option.type}
            type="button"
            onClick={() => onPickType(option.type)}
            onPointerDown={(event) => event.stopPropagation()}
            style={mcpTransportPickerItemStyle(index === OPTIONS.length - 1)}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = tamaguiSurfaces.controlHoverBg;
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = "transparent";
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
