import { useEffect, useState } from "react";
import { Text, YStack } from "tamagui";
import { SplitPane } from "../../components/SplitPane/SplitPane";
import {
  defaultWorkspacePageSession,
  readPageSession,
  writePageSession,
} from "../../session/appSession";
import { deleteGraph } from "../../services/topology/graphApi";
import { useTopologies } from "../../services/topology";
import { colors } from "../../theme";
import { McpPanel } from "../mcp/McpPanel";
import { pageContentInsets } from "../../styles/layout";
import { McpDetailPanel } from "./McpDetailPanel";
import { TopologyGraph } from "./TopologyGraph";
import { TopologyList } from "./TopologyList";

const WORKSPACE_PAGE_SESSION_KEY = "workspace";

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
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    readPageSession(WORKSPACE_PAGE_SESSION_KEY, defaultWorkspacePageSession()).selectedTopologyId,
  );
  const [selectedMcpServerId, setSelectedMcpServerId] = useState<number | null>(null);

  useEffect(() => {
    writePageSession(WORKSPACE_PAGE_SESSION_KEY, { selectedTopologyId: selectedId });
  }, [selectedId]);

  useEffect(() => {
    if (!workspaceActive) {
      return;
    }
    const session = readPageSession(WORKSPACE_PAGE_SESSION_KEY, defaultWorkspacePageSession());
    if (session.selectedTopologyId && session.selectedTopologyId !== selectedId) {
      setSelectedId(session.selectedTopologyId);
      setSelectedMcpServerId(null);
    }
  }, [workspaceActive, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    if (!topologies.some((topology) => topology.id === selectedId)) {
      setSelectedId(null);
      setSelectedMcpServerId(null);
    }
  }, [selectedId, topologies]);

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
    <YStack flex={1} minH={0} minW={0} overflow="hidden" {...pageContentInsets}>
      <SplitPane
        defaultRightRatio={0.75}
        hideDivider
        left={
          <McpPanel
            flex={1}
            minH={0}
            p={0}
            overflow="hidden"
            style={{
              background: colors.surface,
              backdropFilter: "none",
              WebkitBackdropFilter: "none",
            }}
          >
            <TopologyList
              topologies={topologies}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setSelectedMcpServerId(null);
              }}
              onCreate={handleCreate}
              onToggleRunning={toggleRunning}
              onDelete={handleDelete}
            />
          </McpPanel>
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
    </YStack>
  );
}
