import { Text, XStack, YStack } from "tamagui";
import { useCallback, useEffect, useState } from "react";
import { ToolToggle } from "../../components/ToolToggle";
import { useThemeMode } from "../../preferences/ThemeContext";
import type { ColorScheme } from "../../theme";
import { accentAlpha, borders, colors, tamaguiSurfaces } from "../../theme";
import { pageContentInsets } from "../../styles/layout";
import { getUseOsKeyring, setUseOsKeyring } from "../../services/security/securityApi";
import { mcpTableBackground } from "../mcp/mcpTableStyles";
import { McpPanel } from "../mcp/McpPanel";
import { NodeRuntimePanel } from "./NodeRuntimePanel";

function SettingRow({
  title,
  description,
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <XStack items="center" justify="space-between" gap={16} opacity={disabled ? 0.6 : 1}>
      <YStack flex={1} gap={4} minW={0}>
        <Text color={colors.foreground} fontSize={14} fontWeight="600" select="none">
          {title}
        </Text>
        <Text color={colors.muted} fontSize={12} lineHeight={18} select="none">
          {description}
        </Text>
      </YStack>
      <ToolToggle
        checked={checked}
        onChange={(next) => {
          if (!disabled) {
            onChange(next);
          }
        }}
        ariaLabel={ariaLabel}
      />
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
  const { colorScheme, setColorScheme } = useThemeMode();
  const [useOsKeyring, setUseOsKeyringState] = useState(false);
  const [keyringLoading, setKeyringLoading] = useState(true);
  const [keyringError, setKeyringError] = useState<string | null>(null);
  const [keyringSaving, setKeyringSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getUseOsKeyring()
      .then((enabled) => {
        if (!cancelled) {
          setUseOsKeyringState(enabled);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setKeyringError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setKeyringLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleKeyringChange = useCallback((enabled: boolean) => {
    setKeyringSaving(true);
    setKeyringError(null);
    void setUseOsKeyring(enabled)
      .then(() => {
        setUseOsKeyringState(enabled);
      })
      .catch((reason: unknown) => {
        setKeyringError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        setKeyringSaving(false);
      });
  }, []);

  return (
    <YStack
      flex={1}
      {...pageContentInsets}
      gap={12}
      width="100%"
      style={{ maxWidth: 520, alignSelf: "flex-start" }}
    >
      <YStack gap={8} width="100%">
        <Text color={colors.muted} fontSize={15} fontWeight="600" select="none">
          Appearance
        </Text>
        <McpPanel p={16}>
          <ThemeSchemePicker value={colorScheme} onChange={setColorScheme} />
        </McpPanel>
      </YStack>

      <YStack gap={8} width="100%">
        <Text color={colors.muted} fontSize={15} fontWeight="600" select="none">
          Security
        </Text>
        <McpPanel p={16} gap={12}>
          <SettingRow
            title="Use OS keyring"
            description="Store the encryption master key in the system keychain. Off — key is saved next to the local database in app data."
            checked={useOsKeyring}
            onChange={handleKeyringChange}
            ariaLabel="Toggle OS keyring for encryption master key"
            disabled={keyringLoading || keyringSaving}
          />
          {keyringError ? (
            <Text color={colors.error} fontSize={12} select="none">
              {keyringError}
            </Text>
          ) : null}
        </McpPanel>
      </YStack>

      <NodeRuntimePanel />
    </YStack>
  );
}
