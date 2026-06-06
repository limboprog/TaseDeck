import { Input, XStack } from "tamagui";
import { IoSearch } from "../../icons";
import { borders, colors, tamaguiSurfaces } from "../../theme";

type McpInlineSearchProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Horizontal flex when placed inside a row (e.g. next to a + button). */
  flex?: number;
};

export function McpInlineSearch({
  value,
  onChangeText,
  placeholder = "Search",
  flex,
}: McpInlineSearchProps) {
  return (
    <XStack
      flex={flex}
      shrink={0}
      width={flex === undefined ? "100%" : undefined}
      minW={0}
      items="center"
      gap={8}
      px={10}
      height={36}
      rounded={8}
      borderWidth={1}
      borderColor={tamaguiSurfaces.controlBorder}
      bg={tamaguiSurfaces.controlBg}
      focusWithinStyle={{ borderColor: borders.focus }}
    >
      <IoSearch size={15} color={colors.muted} />
      <Input
        flex={1}
        unstyled
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        color={colors.foreground}
        placeholderTextColor={colors.muted as never}
        fontSize={13}
        fontWeight={400}
        height={34}
        borderWidth={0}
        background="transparent"
        focusStyle={{ outlineWidth: 0 }}
        style={{ outline: "none" }}
      />
    </XStack>
  );
}
