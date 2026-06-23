import { useCallback, useState } from "react";
import { IoAdd } from "../../icons";
import { PaneView, ToolbarIconButton } from "../../components/pane";
import { Text, XStack, YStack } from "tamagui";
import type { Topology } from "../../services/topology";
import { colors } from "../../theme";
import { TopologyCreateRow } from "./TopologyCreateRow";
import { TopologyRow } from "./TopologyRow";
import { workspacePaneHeaderStyle } from "./workspacePaneHeader";

type TopologyListProps = {
  topologies: Topology[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onToggleRunning: (id: string) => void;
  onDelete: (id: string) => void;
};

export function TopologyList({
  topologies,
  selectedId,
  onSelect,
  onCreate,
  onToggleRunning,
  onDelete,
}: TopologyListProps) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");

  const resetCreate = useCallback(() => {
    setCreating(false);
    setDraftName("");
  }, []);

  const handleStartCreate = useCallback(() => {
    setCreating(true);
    setDraftName("");
  }, []);

  const handleCommitCreate = useCallback(() => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      return;
    }
    onCreate(trimmed);
    resetCreate();
  }, [draftName, onCreate, resetCreate]);

  const showEmptyHint = topologies.length === 0 && !creating;

  return (
    <PaneView
      flex={1}
      header={
        <XStack items="center" justify="space-between" style={workspacePaneHeaderStyle}>
          <Text color={colors.foreground} fontSize={15} fontWeight="600" select="none">
            Topologies
          </Text>
          <ToolbarIconButton
            onClick={handleStartCreate}
            disabled={creating}
            aria-label="Create topology"
          >
            <IoAdd size={20} />
          </ToolbarIconButton>
        </XStack>
      }
    >
      {showEmptyHint ? (
        <YStack flex={1} justify="center" items="center" px={12} pt={8}>
          <Text color={colors.muted.trim() as never} fontSize={13} text="center">
            No topologies yet. Click + to create one.
          </Text>
        </YStack>
      ) : (
        <YStack className="td-scroll-y" flex={1} minH={0} gap={8} px={10} pt={10} pb={8}>
          {creating ? (
            <TopologyCreateRow
              name={draftName}
              onNameChange={setDraftName}
              onCancel={resetCreate}
              onCommit={handleCommitCreate}
            />
          ) : null}

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
    </PaneView>
  );
}
