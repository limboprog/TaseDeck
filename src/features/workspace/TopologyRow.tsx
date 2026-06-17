import { IoPlay, IoPrism, IoSquare, IoTrash } from "../../icons";
import { Text, XStack } from "tamagui";
import type { Topology } from "../../services/topology";
import { colors, dangerAlpha } from "../../theme";
import { TopologyTableIconButton } from "./TopologyTableIconButton";
import { topologyRowChrome, topologyRowHoverStyle } from "./topologyRowStyles";

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
    <XStack
      width="100%"
      height={44}
      px={14}
      items="center"
      justify="space-between"
      gap={12}
      cursor="pointer"
      style={topologyRowChrome(selected)}
      hoverStyle={topologyRowHoverStyle}
      onPress={onSelect}
    >
      <XStack flex={1} items="center" gap={8} minW={0}>
        <IoPrism size={16} color={colors.accent} aria-hidden />
        <Text
          color={colors.foreground}
          fontSize={14}
          fontWeight={selected ? "600" : "500"}
          numberOfLines={1}
          flex={1}
        >
          {topology.name}
        </Text>
      </XStack>

      <XStack items="center" gap={6} shrink={0} height={28}>
        <TopologyTableIconButton
          aria-label={topology.running ? "Stop topology" : "Run topology"}
          onPress={(event) => {
            event.stopPropagation();
            onToggleRunning();
          }}
        >
          {topology.running ? <IoSquare size={14} /> : <IoPlay size={14} />}
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
      </XStack>
    </XStack>
  );
}
