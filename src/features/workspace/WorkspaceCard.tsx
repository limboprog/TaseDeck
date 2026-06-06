import { Text, XStack, YStack } from "tamagui";
import { GlassPanel } from "../../components/Glass/GlassPanel";
import type { Workspace } from "../../services/workspace";
import { borders, colors, surfaces, tamaguiSurfaces } from "../../theme";

type WorkspaceCardProps = {
  workspace: Workspace;
};

function Chip({ label }: { label: string }) {
  return (
    <XStack
      px={8}
      py={4}
      rounded={999}
      bg={surfaces.card}
      borderWidth={1}
      borderColor={tamaguiSurfaces.controlHoverBg}
    >
      <Text color={colors.muted} fontSize={11} fontWeight="500">
        {label}
      </Text>
    </XStack>
  );
}

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const updated = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(workspace.updatedAt));

  return (
    <GlassPanel
      p={20}
      glow
      minH={220}
      height="100%"
      overflow="hidden"
      cursor="default"
      hoverStyle={{ borderColor: borders.focus }}
    >
      <YStack gap={14} z={1} height="100%" justify="space-between">
        <YStack gap={8}>
          <Text
            color={colors.foreground}
            fontSize={22}
            fontWeight="700"
            letterSpacing={-0.02}
          >
            {workspace.name}
          </Text>
          <Text color={colors.muted} fontSize={13}>
            Updated {updated}
          </Text>
        </YStack>

        <XStack gap={8} flexWrap="wrap">
          <Chip label={`${workspace.agents.length} agents`} />
          <Chip label={`${workspace.mcps.length} MCP`} />
        </XStack>

        <YStack gap={8}>
          {workspace.agents.length > 0 ? (
            <YStack gap={4}>
              <Text color={colors.muted} fontSize={12} fontWeight="600">
                Agents
              </Text>
              {workspace.agents.slice(0, 3).map((agent) => (
                <Text
                  key={agent.id}
                  color={colors.foreground}
                  fontSize={13}
                  opacity={0.85}
                  numberOfLines={1}
                  style={{ fontFamily: "monospace" }}
                >
                  {agent.name}
                </Text>
              ))}
            </YStack>
          ) : null}

          {workspace.mcps.length > 0 ? (
            <YStack gap={4}>
              <Text color={colors.muted} fontSize={12} fontWeight="600">
                MCP
              </Text>
              {workspace.mcps.slice(0, 3).map((mcp) => (
                <Text
                  key={mcp.id}
                  color={colors.foreground}
                  fontSize={13}
                  opacity={0.85}
                  numberOfLines={1}
                  style={{ fontFamily: "monospace" }}
                >
                  {mcp.name}
                </Text>
              ))}
            </YStack>
          ) : null}
        </YStack>
      </YStack>
    </GlassPanel>
  );
}
