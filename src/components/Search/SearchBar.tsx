import { memo, useCallback, useState } from "react";
import { Input, Text, XStack, YStack } from "tamagui";
import { colors } from "../../theme";
import { GlassPanel } from "../Glass/GlassPanel";

export type SearchBarProps = {
  defaultValue?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  hint?: string;
};

function SearchIcon() {
  return (
    <Text color={colors.muted} fontSize={15} lineHeight={15} select="none">
      ⌕
    </Text>
  );
}

export const SearchBar = memo(function SearchBar({
  defaultValue = "",
  onValueChange,
  placeholder = "Search…",
  ariaLabel = "Search",
  hint,
}: SearchBarProps) {
  const [value, setValue] = useState(defaultValue);

  const handleChange = useCallback(
    (nextValue: string) => {
      setValue(nextValue);
      onValueChange(nextValue);
    },
    [onValueChange],
  );

  return (
    <YStack width="100%" gap={6}>
      <GlassPanel px={14} py={10} glow>
        <XStack items="center" gap={10} z={1}>
          <SearchIcon />
          <Input
            unstyled
            flex={1}
            value={value}
            onChangeText={handleChange}
            placeholder={placeholder}
            aria-label={ariaLabel}
            color={colors.foreground}
            placeholderTextColor={colors.muted as never}
            fontSize={15}
            height={24}
            background="transparent"
            borderWidth={0}
            style={{ outline: "none" }}
          />
          {value.length > 0 ? (
            <Text
              color={colors.muted}
              fontSize={13}
              cursor="pointer"
              hoverStyle={{ color: colors.foreground }}
              onPress={() => handleChange("")}
              aria-label="Clear search"
            >
              Clear
            </Text>
          ) : null}
        </XStack>
      </GlassPanel>
      {hint ? (
        <Text color={colors.muted} fontSize={12} px={2}>
          {hint}
        </Text>
      ) : null}
    </YStack>
  );
});
