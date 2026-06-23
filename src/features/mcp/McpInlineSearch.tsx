import { Input } from "tamagui";
import { IoSearch } from "../../icons";
import {
  PANE_TOOLBAR_ICON_SIZE,
  paneToolbarSearchShellStyle,
} from "../../components/pane/paneStyles";
import { colors } from "../../theme";

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
    <div
      style={{
        ...paneToolbarSearchShellStyle(),
        flex: flex === undefined ? undefined : flex,
        width: flex === undefined ? "100%" : undefined,
        flexShrink: 0,
      }}
      className="mcp-inline-search"
    >
      <IoSearch size={15} color={colors.muted} aria-hidden />
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
        height={PANE_TOOLBAR_ICON_SIZE - 2}
        borderWidth={0}
        background="transparent"
        focusStyle={{ outlineWidth: 0 }}
        style={{ outline: "none", minWidth: 0 }}
      />
    </div>
  );
}
