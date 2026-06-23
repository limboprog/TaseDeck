import { Text, XStack } from "tamagui";
import { colors } from "../../theme";

type PresetSectionCountLabelProps = {
  count: number;
  label: string;
};

/** Same count badge + label pattern as Add servers section header. */
export function PresetSectionCountLabel({ count, label }: PresetSectionCountLabelProps) {
  return (
    <XStack gap={6} items="center" shrink={0} pointerEvents="none">
      <XStack
        minW={18}
        height={18}
        px={count > 9 ? 5 : 0}
        width={count > 9 ? undefined : 18}
        rounded={999}
        bg={colors.accent}
        items="center"
        justify="center"
        shrink={0}
      >
        <Text color="#fff" fontSize={10} fontWeight="700" lineHeight={12} select="none">
          {count > 99 ? "99+" : count}
        </Text>
      </XStack>
      <Text color={colors.muted} fontSize={11} fontWeight="600" select="none">
        {label}
      </Text>
    </XStack>
  );
}
