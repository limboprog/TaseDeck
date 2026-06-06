import { MdOutlineJoinLeft } from "../../icons";
import { Button, XStack } from "tamagui";
import { colors, tamaguiSurfaces } from "../../theme";

type WorkspaceToolbarProps = {
  groupToolActive: boolean;
  onToggleGroupTool: () => void;
};

export function WorkspaceToolbar({ groupToolActive, onToggleGroupTool }: WorkspaceToolbarProps) {
  const tooltip = groupToolActive
    ? "Отменить группировку"
    : "Group — выделите область на холсте с MCP-серверами";

  return (
    <XStack
      items="center"
      p={4}
      rounded={8}
      borderWidth={1}
      borderColor={groupToolActive ? colors.accent : tamaguiSurfaces.activeBg}
      bg={groupToolActive ? tamaguiSurfaces.accentTintBg : tamaguiSurfaces.controlBg}
    >
      <div title={tooltip}>
        <Button
          unstyled
          width={32}
          height={32}
          rounded={7}
          hoverStyle={{ bg: tamaguiSurfaces.activeBg }}
          onPress={onToggleGroupTool}
          aria-label={tooltip}
          aria-pressed={groupToolActive}
        >
          <XStack
            flex={1}
            items="center"
            justify="center"
            style={{ color: groupToolActive ? colors.accent : colors.foreground }}
          >
            <MdOutlineJoinLeft size={18} />
          </XStack>
        </Button>
      </div>
    </XStack>
  );
}
