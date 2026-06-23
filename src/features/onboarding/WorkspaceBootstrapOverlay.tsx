import { Text, YStack } from "tamagui";
import { colors } from "../../theme";

type WorkspaceBootstrapOverlayProps = {
  message: string;
};

export function WorkspaceBootstrapOverlay({ message }: WorkspaceBootstrapOverlayProps) {
  return (
    <YStack
      position="absolute"
      inset={0}
      z={1000}
      justify="center"
      items="center"
      px={24}
      style={{ background: colors.page }}
    >
      <YStack gap={12} maxW={420} items="center">
        <Text color={colors.foreground} fontSize={16} fontWeight="600" text="center" select="none">
          Setting up workspace
        </Text>
        <Text color={colors.muted} fontSize={13} text="center" lineHeight={20} select="none">
          {message}
        </Text>
      </YStack>
    </YStack>
  );
}
