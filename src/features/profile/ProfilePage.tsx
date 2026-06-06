import { Text, XStack, YStack } from "tamagui";
import { ToolToggle } from "../../components/ToolToggle";
import { useSurfaceMode } from "../../preferences/SurfaceModeContext";
import { useThemeMode } from "../../preferences/ThemeContext";
import { colors } from "../../theme";
import { McpPanel } from "../mcp/McpPanel";

function SettingRow({
  title,
  description,
  checked,
  onChange,
  ariaLabel,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <XStack items="center" justify="space-between" gap={16}>
      <YStack flex={1} gap={4} minW={0}>
        <Text color={colors.foreground} fontSize={14} fontWeight="600" select="none">
          {title}
        </Text>
        <Text color={colors.muted} fontSize={12} lineHeight={18} select="none">
          {description}
        </Text>
      </YStack>
      <ToolToggle checked={checked} onChange={onChange} ariaLabel={ariaLabel} />
    </XStack>
  );
}

export function ProfilePage() {
  const { liquidGlass, setLiquidGlass } = useSurfaceMode();
  const { isLight, setColorScheme } = useThemeMode();

  return (
    <YStack gap={16} maxW={520} width="100%">
      <Text color={colors.foreground} fontSize={22} fontWeight="700" select="none">
        Profile
      </Text>

      <McpPanel p={16} gap={16}>
        <SettingRow
          title="Light theme"
          description="Switch between dark and light color palettes across the app."
          checked={isLight}
          onChange={(enabled) => setColorScheme(enabled ? "light" : "dark")}
          ariaLabel="Toggle light theme"
        />

        <YStack height={1} bg={colors.border} opacity={0.5} />

        <SettingRow
          title="Liquid glass"
          description="Blur, gradient and glow on panels and the main content area. Off — solid surfaces."
          checked={liquidGlass}
          onChange={setLiquidGlass}
          ariaLabel="Toggle liquid glass interface"
        />
      </McpPanel>
    </YStack>
  );
}
