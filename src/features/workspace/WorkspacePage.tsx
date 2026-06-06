import { useState } from "react";
import { Text, YStack } from "tamagui";
import { SplitPane } from "../../components/SplitPane/SplitPane";
import { deleteGraph } from "../../services/topology/graphApi";
import { useTopologies } from "../../services/topology";
import { colors } from "../../theme";
import { CreateTopologyModal } from "./CreateTopologyModal";
import { McpDetailPanel } from "./McpDetailPanel";
import { TopologyGraph } from "./TopologyGraph";
import { TopologyList } from "./TopologyList";

type WorkspacePageProps = {
  workspaceActive?: boolean;
};

export function WorkspacePage({ workspaceActive = true }: WorkspacePageProps) {
  const {
    topologies,
    addTopology,
    updateTopology,
    removeTopology,
    toggleRunning,
  } = useTopologies();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMcpServerId, setSelectedMcpServerId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const selectedTopology =
    topologies.find((topology) => topology.id === selectedId) ?? null;

  const handleCreate = (name: string) => {
    const topology = addTopology(name);
    setSelectedId(topology.id);
  };

  const handleDelete = (id: string) => {
    deleteGraph(id).catch(() => undefined);
    removeTopology(id);
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedMcpServerId(null);
    }
  };

  return (
    <YStack flex={1} minH={0} minW={0} overflow="hidden">
      <SplitPane
        defaultRightRatio={0.75}
        left={
          <TopologyList
            topologies={topologies}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setSelectedMcpServerId(null);
            }}
            onCreateClick={() => setModalOpen(true)}
            onToggleRunning={toggleRunning}
            onDelete={handleDelete}
          />
        }
        right={
          selectedTopology ? (
            <YStack flex={1} minH={0} minW={0} position="relative" overflow="hidden">
              <TopologyGraph
                topology={selectedTopology}
                workspaceActive={workspaceActive}
                onOpenMcpPanel={setSelectedMcpServerId}
                onTopologyChange={(patch) => updateTopology(selectedTopology.id, patch)}
              />
              {selectedMcpServerId ? (
                <McpDetailPanel
                  serverId={selectedMcpServerId}
                  onClose={() => setSelectedMcpServerId(null)}
                />
              ) : null}
            </YStack>
          ) : (
            <YStack flex={1} justify="center" items="center" px={24}>
              <Text color={colors.muted.trim() as never} fontSize={14} text="center">
                Select a topology or create a new one with +.
              </Text>
            </YStack>
          )
        }
      />

      <CreateTopologyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
      />
    </YStack>
  );
}
