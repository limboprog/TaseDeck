import { Text, XStack, YStack } from "tamagui";
import { colors } from "../../theme";
import { McpTableHeaderCopy } from "./table/McpTableCells";

type McpConfigPreviewProps = {
  title: string;
  content: string;
};

export function McpConfigPreview({ title, content }: McpConfigPreviewProps) {
  const display = content.trim();

  return (
    <YStack gap={8} width="100%">
      <XStack width="100%" items="center" justify="space-between" gap={8}>
        <Text color={colors.muted} fontSize={13} fontWeight="600" select="none">
          {title}
        </Text>
        <McpTableHeaderCopy value={display} disabled={!display} />
      </XStack>
      <Text
        color={colors.foreground}
        fontSize={12}
        lineHeight={18}
        whiteSpace="pre-wrap"
        wordWrap="break-word"
        select="text"
        style={{ fontFamily: "monospace" }}
      >
        {display || "—"}
      </Text>
    </YStack>
  );
}
