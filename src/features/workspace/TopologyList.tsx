import { IoAdd } from "../../icons";
import { Button, Text, XStack, YStack } from "tamagui";
import type { Topology } from "../../services/topology";
import { borders, colors, tamaguiSurfaces } from "../../theme";
import { TopologyRow } from "./TopologyRow";
import { workspacePaneHeaderStyle } from "./workspacePaneHeader";

type TopologyListProps = {
  topologies: Topology[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateClick: () => void;
  onToggleRunning: (id: string) => void;
  onDelete: (id: string) => void;
};

export function TopologyList({
  topologies,
  selectedId,
  onSelect,
  onCreateClick,
  onToggleRunning,
  onDelete,
}: TopologyListProps) {
  return (
    <YStack flex={1} minH={0} minW={0}>
      <XStack
        items="center"
        justify="space-between"
        style={workspacePaneHeaderStyle}
      >
        <Text color={colors.foreground} fontSize={15} fontWeight="600" select="none">
          Topologies
        </Text>
        <Button
          unstyled
          width={32}
          height={32}
          rounded={8}
          bg={tamaguiSurfaces.controlHoverBg}
          hoverStyle={{ bg: borders.strong }}
          onPress={onCreateClick}
          aria-label="Create topology"
        >
          <XStack flex={1} items="center" justify="center" style={{ color: colors.foreground }}>
            <IoAdd size={20} />
          </XStack>
        </Button>
      </XStack>

      {topologies.length === 0 ? (
        <YStack flex={1} justify="center" items="center" px={12} pt={8}>
          <Text color={colors.muted.trim() as never} fontSize={13} text="center">
            No topologies yet. Click + to create one.
          </Text>
        </YStack>
      ) : (
        <YStack flex={1} minH={0} overflow="scroll" gap={8} px={10} pt={10} pb={8}>
          {topologies.map((topology) => (
            <TopologyRow
              key={topology.id}
              topology={topology}
              selected={topology.id === selectedId}
              onSelect={() => onSelect(topology.id)}
              onToggleRunning={() => onToggleRunning(topology.id)}
              onDelete={() => onDelete(topology.id)}
            />
          ))}
        </YStack>
      )}
    </YStack>
  );
}
