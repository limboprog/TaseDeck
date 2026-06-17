import { Text, XStack, YStack } from "tamagui";
import { ToolToggle } from "../../components/ToolToggle";
import { useSurfaceMode } from "../../preferences/SurfaceModeContext";
import { useThemeMode } from "../../preferences/ThemeContext";
import type { ColorScheme } from "../../theme";
import { accentAlpha, borders, colors, tamaguiSurfaces } from "../../theme";
import { mcpTableBackground } from "../mcp/mcpTableStyles";
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

function SchemeOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        flex: 1,
        height: 36,
        borderRadius: 8,
        border: `1px solid ${selected ? colors.accent : borders.default}`,
        background: selected ? accentAlpha[12] : mcpTableBackground,
        color: selected ? colors.foreground : colors.muted,
        fontSize: 14,
        fontWeight: selected ? 600 : 500,
        cursor: "pointer",
        fontFamily: "inherit",
        appearance: "none",
        transition: "background 120ms ease, border-color 120ms ease",
      }}
      onMouseEnter={(event) => {
        if (!selected) {
          event.currentTarget.style.background = tamaguiSurfaces.controlHoverBg;
        }
      }}
      onMouseLeave={(event) => {
        if (!selected) {
          event.currentTarget.style.background = mcpTableBackground;
        }
      }}
    >
      {label}
    </button>
  );
}

function ThemeSchemePicker({
  value,
  onChange,
}: {
  value: ColorScheme;
  onChange: (scheme: ColorScheme) => void;
}) {
  return (
    <XStack gap={8} width="100%">
      <SchemeOption
        label="Light"
        selected={value === "light"}
        onSelect={() => onChange("light")}
      />
      <SchemeOption
        label="Dark"
        selected={value === "dark"}
        onSelect={() => onChange("dark")}
      />
    </XStack>
  );
}

export function ProfilePage() {
  const { liquidGlass, setLiquidGlass } = useSurfaceMode();
  const { colorScheme, setColorScheme } = useThemeMode();

  return (
    <YStack flex={1} px={16} py={14} gap={12} maxW={520} width="100%">
      <Text color={colors.foreground} fontSize={22} fontWeight="700" select="none">
        Profile
      </Text>

      <YStack gap={8} width="100%">
        <Text color={colors.muted} fontSize={15} fontWeight="600" select="none">
          Appearance
        </Text>
        <McpPanel p={16}>
          <ThemeSchemePicker value={colorScheme} onChange={setColorScheme} />
        </McpPanel>
      </YStack>

      <McpPanel p={16} gap={16}>
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
