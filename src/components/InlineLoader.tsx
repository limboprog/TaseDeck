import { Text, YStack } from "tamagui";
import { LoaderSpinner } from "./LoaderSpinner";
import { colors } from "../theme";

type InlineLoaderProps = {
  label?: string;
  minHeight?: number;
};

export function InlineLoader({ label = "Loading…", minHeight = 72 }: InlineLoaderProps) {
  return (
    <YStack items="center" justify="center" gap={8} py={16} minH={minHeight}>
      <LoaderSpinner size={22} ariaLabel="Loading" />
      <Text color={colors.muted} fontSize={12} select="none">
        {label}
      </Text>
    </YStack>
  );
}
