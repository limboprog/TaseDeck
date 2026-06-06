import { IoTrash } from "../../icons";
import { Button, Text, XStack, YStack } from "tamagui";
import type { ConfiguredAgent } from "../../services/agents";
import { borders, colors, dangerAlpha, surfaces } from "../../theme";

type AgentCardProps = {
  agent: ConfiguredAgent;
  configDirPath: string;
  onRemove: () => void;
};

export function AgentCard({ agent, configDirPath, onRemove }: AgentCardProps) {
  return (
    <YStack
      gap={10}
      p={14}
      rounded={10}
      borderWidth={1}
      borderColor={borders.strong}
      bg={surfaces.subtle}
    >
      <XStack items="center" justify="space-between" gap={12}>
        <YStack gap={2} flex={1} minW={0}>
          <Text color={colors.foreground} fontSize={15} fontWeight="600">
            {agent.name}
          </Text>
          <Text color={colors.muted} fontSize={12}>
            Cursor
          </Text>
        </YStack>

        <Button
          unstyled
          width={28}
          height={28}
          rounded={6}
          hoverStyle={{ bg: dangerAlpha[12] }}
          onPress={onRemove}
          aria-label="Remove agent"
        >
          <XStack flex={1} items="center" justify="center" style={{ color: colors.muted }}>
            <IoTrash size={14} />
          </XStack>
        </Button>
      </XStack>

      <YStack gap={4}>
        <Text color={colors.muted} fontSize={11} fontWeight="600">
          CONFIG FOLDER
        </Text>
        <Text color={colors.foreground} fontSize={12} numberOfLines={2} style={{ fontFamily: "monospace" }}>
          {configDirPath}
        </Text>
      </YStack>
    </YStack>
  );
}
