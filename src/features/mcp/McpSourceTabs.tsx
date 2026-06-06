import { Button, Text, XStack } from "tamagui";
import { getMcpSource, type McpSourceId } from "../../services/mcp_registry";
import { usePanelChrome } from "../../preferences/usePanelChrome";
import { colors, surfaces, tamaguiSurfaces } from "../../theme";

type McpSourceTabsProps = {
  value: McpSourceId;
  options: McpSourceId[];
  onChange: (value: McpSourceId) => void;
};

export function McpSourceTabs({ value, options, onChange }: McpSourceTabsProps) {
  const { borderColor: panelBorder } = usePanelChrome();

  return (
    <XStack gap={8} flexWrap="wrap">
      {options.map((option) => {
        const isActive = value === option;
        const label = getMcpSource(option).label;

        return (
          <Button
            key={option}
            unstyled
            px={14}
            py={8}
            rounded={999}
            borderWidth={1}
            borderColor={isActive ? panelBorder : "transparent"}
            bg={isActive ? tamaguiSurfaces.controlHoverBg : surfaces.disabled}
            hoverStyle={{
              bg: surfaces.card,
            }}
            pressStyle={{
              bg: "rgba(255, 255, 255, 0.07)",
            }}
            onPress={() => onChange(option)}
            aria-pressed={isActive}
          >
            <Text
              color={isActive ? colors.foreground : colors.muted}
              fontSize={14}
              fontWeight={isActive ? "500" : "400"}
            >
              {label}
            </Text>
          </Button>
        );
      })}
    </XStack>
  );
}
