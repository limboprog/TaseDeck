import { Text, YStack } from "tamagui";
import type { AgentRecord } from "../../services/agents/recordsApi";
import { AgentBrandLogo } from "../../services/agents/AgentBrandLogo";
import { borders, colors, project } from "../../theme";
import { PANE_ROW_RADIUS } from "../../components/pane/paneStyles";

type ProjectAgentPickerProps = {
  agents: AgentRecord[];
  onPick: (agentId: number) => void;
};

export function ProjectAgentPicker({ agents, onPick }: ProjectAgentPickerProps) {
  if (agents.length === 0) {
    return (
      <Text color={colors.muted} fontSize={12} py={4} select="none">
        All configured agents are already linked to this project.
      </Text>
    );
  }

  return (
    <YStack gap={6} width="100%" maxW={320}>
      {agents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          onClick={() => onPick(agent.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "8px 10px",
            borderRadius: PANE_ROW_RADIUS,
            border: `1px solid ${borders.faint}`,
            background: project.nodeSignificant,
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <AgentBrandLogo kind={agent.kind} size={20} />
          <Text color={colors.foreground} fontSize={13} fontWeight="600" select="none">
            {agent.name}
          </Text>
        </button>
      ))}
    </YStack>
  );
}
