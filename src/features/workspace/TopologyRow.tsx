import { IoPlayOutline, IoPrism, IoStopOutline, IoTrash } from "../../icons";
import { PaneRow } from "../../components/pane";
import type { Topology } from "../../services/topology";
import { colors, dangerAlpha } from "../../theme";
import { TopologyTableIconButton } from "./TopologyTableIconButton";

type TopologyRowProps = {
  topology: Topology;
  selected: boolean;
  onSelect: () => void;
  onToggleRunning: () => void;
  onDelete: () => void;
};

export function TopologyRow({
  topology,
  selected,
  onSelect,
  onToggleRunning,
  onDelete,
}: TopologyRowProps) {
  return (
    <PaneRow
      title={topology.name}
      selected={selected}
      accentBorder={topology.running}
      onPress={onSelect}
      leading={<IoPrism size={16} color={colors.accent} aria-hidden />}
      trailing={
        <>
          <TopologyTableIconButton
            aria-label={topology.running ? "Stop topology" : "Run topology"}
            onPress={(event) => {
              event.stopPropagation();
              onToggleRunning();
            }}
          >
            {topology.running ? (
              <IoStopOutline size={18} />
            ) : (
              <IoPlayOutline size={16} />
            )}
          </TopologyTableIconButton>

          <button
            type="button"
            aria-label="Delete topology"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = dangerAlpha[12];
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = "transparent";
            }}
            style={{
              width: 28,
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
            }}
          >
            <IoTrash size={14} />
          </button>
        </>
      }
    />
  );
}
