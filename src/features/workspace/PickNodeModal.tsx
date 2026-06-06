import { Button, Text, XStack, YStack } from "tamagui";
import { GlassPanel } from "../../components/Glass/GlassPanel";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import type { AgentRecord } from "../../services/agents/recordsApi";
import type { TopologyNodeType } from "../../services/topology";
import { borders, colors, tamaguiSurfaces } from "../../theme";

type PickNodeModalProps = {
  type: TopologyNodeType;
  installedMcps: InstalledMcpServer[];
  agentRecords: AgentRecord[];
  onPickAgent: (agent: AgentRecord) => void;
  onPickMcp: (server: InstalledMcpServer) => void;
  onClose: () => void;
};

export function PickNodeModal({
  type,
  installedMcps,
  agentRecords,
  onPickAgent,
  onPickMcp,
  onClose,
}: PickNodeModalProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(8, 9, 10, 0.45)",
        backdropFilter: "blur(4px)",
      }}
      onPointerDown={onClose}
    >
      <div
        onPointerDown={(event) => event.stopPropagation()}
        style={{ width: "min(360px, 92%)", maxHeight: "72%", userSelect: "none" }}
      >
        <GlassPanel rounded={12} p={16} gap={12}>
          <XStack items="center" justify="space-between">
            <Text color={colors.foreground} fontSize={17} fontWeight="700" select="none">
              {type === "agent" ? "Choose agent" : "Choose MCP server"}
            </Text>
            <Button
              unstyled
              px={8}
              py={4}
              rounded={6}
              hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
              onPress={onClose}
            >
              <Text color={colors.muted} fontSize={13} select="none">
                Cancel
              </Text>
            </Button>
          </XStack>

          <YStack gap={6} maxH={320} overflow="scroll">
            {type === "agent" ? (
              agentRecords.length === 0 ? (
                <Text color={colors.muted} fontSize={13} px={4} py={8} select="none">
                  Add an agent on the Agents tab first.
                </Text>
              ) : (
                agentRecords.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => onPickAgent(agent)}
                    style={{
                      width: "100%",
                      minHeight: 40,
                      textAlign: "left",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: `1px solid ${borders.strong}`,
                      background: tamaguiSurfaces.controlBg,
                      color: colors.foreground,
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ display: "block" }}>{agent.name}</span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 10,
                        color: colors.muted,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {agent.configDirPath}
                    </span>
                  </button>
                ))
              )
            ) : installedMcps.length === 0 ? (
              <Text color={colors.muted} fontSize={13} px={4} py={8} select="none">
                Install MCP from Market, then fill required variables on the MCP tab.
              </Text>
            ) : (
              installedMcps.map((server) => (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => onPickMcp(server)}
                  style={{
                    width: "100%",
                    height: 40,
                    textAlign: "left",
                    padding: "0 12px",
                    borderRadius: 8,
                    border: `1px solid ${borders.strong}`,
                    background: tamaguiSurfaces.controlBg,
                    color: colors.foreground,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {server.name}
                </button>
              ))
            )}
          </YStack>
        </GlassPanel>
      </div>
    </div>
  );
}
