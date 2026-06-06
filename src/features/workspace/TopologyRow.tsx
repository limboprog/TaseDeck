import { IoPlay, IoPrism, IoSquare, IoTrash } from "../../icons";
import { Button, Text, XStack } from "tamagui";
import type { Topology } from "../../services/topology";
import { borders, colors, dangerAlpha, surfaces, tamaguiSurfaces } from "../../theme";

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
      bg={selected ? tamaguiSurfaces.activeBg : surfaces.subtle}
      borderWidth={1}
      borderColor={selected ? borders.selected : tamaguiSurfaces.controlHoverBg}
      rounded={8}
      hoverStyle={{ bg: tamaguiSurfaces.controlHoverBg }}
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

      <XStack items="center" gap={6} shrink={0}>
        <Button
          unstyled
          width={28}
          height={28}
          rounded={6}
          hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
          onPress={(event) => {
            event.stopPropagation();
            onToggleRunning();
          }}
          aria-label={topology.running ? "Stop topology" : "Run topology"}
        >
          <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
            {topology.running ? <IoSquare size={14} /> : <IoPlay size={14} />}
          </XStack>
        </Button>

        <Button
          unstyled
          width={28}
          height={28}
          rounded={6}
          hoverStyle={{ bg: dangerAlpha[12] }}
          onPress={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label="Delete topology"
        >
          <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
            <IoTrash size={14} />
          </XStack>
        </Button>
      </XStack>
    </XStack>
  );
}
