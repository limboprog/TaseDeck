import { useState, type CSSProperties } from "react";
import { IoAdd } from "../../icons";
import type { TopologyNodeType } from "../../services/topology";
import { colors } from "../../theme";
import { mcpTableRowLine } from "../mcp/mcpTableStyles";
import {
  clearOpaqueShellHover,
  clearTableIconHover,
  opaqueCommandFill,
  setOpaqueShellHover,
  setTableIconHover,
} from "./topologyTableInteraction";
import { workspaceIconButtonChrome } from "./workspaceIconButton";

const OPTIONS: { type: TopologyNodeType; label: string }[] = [
  { type: "agent", label: "Agent" },
  { type: "mcp", label: "MCP" },
];

const SIZE = 32;
const EXPANDED_WIDTH = 132;
const EXPANDED_HEIGHT = SIZE * 3;

type TopologyAddControlProps = {
  onPickType: (type: TopologyNodeType) => void;
};

export function TopologyAddControl({ onPickType }: TopologyAddControlProps) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const handleToggle = () => {
    setOpen((current) => !current);
  };

  const handlePick = (type: TopologyNodeType) => {
    onPickType(type);
    close();
  };

  const shellStyle: CSSProperties = {
    width: open ? EXPANDED_WIDTH : SIZE,
    height: open ? EXPANDED_HEIGHT : SIZE,
    ...workspaceIconButtonChrome(),
    background: opaqueCommandFill,
    overflow: "hidden",
    display: "grid",
    gridTemplateColumns: `${SIZE}px 1fr`,
    gridTemplateRows: `repeat(3, ${SIZE}px)`,
  };

  return (
    <div
      className={`topology-add-control${open ? " is-open" : ""}`}
      data-open={open ? "true" : "false"}
      onPointerEnter={(event) => {
        if (!open) {
          setOpaqueShellHover(event.currentTarget);
        }
      }}
      onPointerLeave={(event) => {
        clearOpaqueShellHover(event.currentTarget);
      }}
      style={shellStyle}
    >
      <button
        type="button"
        className="topology-add-control__toggle"
        onClick={handleToggle}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={open ? "Close add menu" : "Add node"}
        aria-expanded={open}
        style={{
          gridColumn: "1",
          gridRow: "1",
          width: SIZE,
          height: SIZE,
          border: "none",
          background: "transparent",
          color: colors.foreground,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          zIndex: 1,
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.16s ease",
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
          }}
        >
          <IoAdd size={20} />
        </span>
      </button>

      <div
        aria-hidden
        style={{
          gridColumn: "2",
          gridRow: "1",
          height: SIZE,
          borderBottom: open ? mcpTableRowLine : "none",
        }}
      />

      {OPTIONS.map((option, index) => (
        <button
          key={option.type}
          type="button"
          className="topology-add-control__option"
          onClick={() => handlePick(option.type)}
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            gridColumn: "1 / -1",
            gridRow: String(index + 2),
            height: SIZE,
            border: "none",
            borderTop: mcpTableRowLine,
            background: "transparent",
            color: colors.foreground,
            fontSize: 12,
            fontWeight: 500,
            textAlign: "left",
            padding: "0 12px",
            cursor: open ? "pointer" : "default",
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
          }}
          onMouseEnter={(event) => setTableIconHover(event.currentTarget)}
          onMouseLeave={(event) => clearTableIconHover(event.currentTarget)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
