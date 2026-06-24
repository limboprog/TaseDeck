import { useEffect, useMemo, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import { ToolToggle } from "../../components/ToolToggle";
import {
  defaultAppSettings,
  downloadNodeRuntime,
  getNodeRuntimeStatus,
  pickNodeExecutable,
  type AppSettings,
  validateNodePath,
} from "../../services/app/appSettingsApi";
import { colors, tamaguiSurfaces, borders } from "../../theme";
import { McpPanel } from "../mcp/McpPanel";
import { McpDataTable, McpTableRow } from "../mcp/table/McpDataTable";
import { McpTableCell, McpTableFolderPath } from "../mcp/table/McpTableCells";

type InitialSetupOverlayProps = {
  onComplete: (settings: AppSettings) => void;
};

function SetupToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <XStack items="flex-start" justify="space-between" gap={16}>
      <YStack flex={1} gap={4} minW={0}>
        <Text color={colors.foreground} fontSize={14} fontWeight="600" select="none">
          {title}
        </Text>
        <Text color={colors.muted} fontSize={12} lineHeight={18} select="none">
          {description}
        </Text>
      </YStack>
      <ToolToggle checked={checked} onChange={onChange} ariaLabel={title} />
    </XStack>
  );
}

function formatVersion(version: string | null | undefined) {
  if (!version) {
    return null;
  }
  const trimmed = version.trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

export function InitialSetupOverlay({ onComplete }: InitialSetupOverlayProps) {
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings());
  const [draftPath, setDraftPath] = useState("");
  const [runtimeFound, setRuntimeFound] = useState(false);
  const [runtimeVersion, setRuntimeVersion] = useState<string | null>(null);
  const [draftValid, setDraftValid] = useState(false);
  const [validating, setValidating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allEnabled = useMemo(
    () =>
      settings.enableFileScan &&
      settings.enableAgentSync &&
      settings.enableToolIndex &&
      settings.enableLogCollection,
    [settings],
  );

  useEffect(() => {
    void getNodeRuntimeStatus().then((status) => {
      setRuntimeFound(status.found);
      setRuntimeVersion(status.version ?? null);
      if (status.path) {
        setDraftPath(status.path);
      }
    });
  }, []);

  useEffect(() => {
    const trimmed = draftPath.trim();
    if (!trimmed) {
      setDraftValid(false);
      setValidating(false);
      return;
    }

    setValidating(true);
    const timer = window.setTimeout(() => {
      void validateNodePath(trimmed)
        .then((version) => {
          setRuntimeVersion(version);
          setDraftValid(true);
          setError(null);
        })
        .catch((cause: unknown) => {
          setDraftValid(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => setValidating(false));
    }, 280);

    return () => window.clearTimeout(timer);
  }, [draftPath]);

  const setAllEnabled = (enabled: boolean) => {
    setSettings((current) => ({
      ...current,
      enableFileScan: enabled,
      enableAgentSync: enabled,
      enableToolIndex: enabled,
      enableLogCollection: enabled,
    }));
  };

  const showDownload = !runtimeFound && !draftValid && !validating && !downloading;
  const canContinue = runtimeFound || draftValid;

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const path = await downloadNodeRuntime();
      setDraftPath(path);
      setRuntimeFound(true);
      const status = await getNodeRuntimeStatus();
      setRuntimeVersion(status.version ?? null);
      setDraftValid(true);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDownloading(false);
    }
  };

  const handleContinue = async () => {
    if (!canContinue) {
      setError("Node.js is required before continuing.");
      return;
    }
    setBusy(true);
    try {
      const trimmed = draftPath.trim();
      if (trimmed && draftValid) {
        await validateNodePath(trimmed);
      }
      onComplete({
        ...settings,
        nodePath: trimmed || null,
        setupCompleted: true,
      });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const versionLabel = validating
    ? "Checking path…"
    : draftValid || runtimeFound
      ? formatVersion(runtimeVersion) ?? "Detected"
      : "Not detected";

  return (
    <YStack
      position="absolute"
      inset={0}
      z={1100}
      justify="center"
      items="center"
      px={24}
      style={{ background: colors.page }}
    >
      <YStack
        gap={20}
        maxW={560}
        width="100%"
        p={24}
        style={{
          borderRadius: 14,
          border: `1px solid ${colors.border}`,
          background: tamaguiSurfaces.controlBg,
        }}
      >
        <YStack gap={8}>
          <Text color={colors.foreground} fontSize={18} fontWeight="700" select="none">
            Welcome to TaseDeck
          </Text>
          <Text color={colors.muted} fontSize={13} lineHeight={20} select="none">
            Choose what TaseDeck should set up on first launch.
          </Text>
        </YStack>

        <SetupToggle
          title="Enable everything"
          description="Scan project folders, sync agents, index MCP tools, and collect proxy usage logs."
          checked={allEnabled}
          onChange={setAllEnabled}
        />

        <YStack gap={14} pl={8}>
          <SetupToggle
            title="Scan project folders"
            description="Discover local projects from installed agents."
            checked={settings.enableFileScan}
            onChange={(checked) => setSettings((current) => ({ ...current, enableFileScan: checked }))}
          />
          <SetupToggle
            title="Sync agents"
            description="Import installed coding agents into TaseDeck."
            checked={settings.enableAgentSync}
            onChange={(checked) =>
              setSettings((current) => ({ ...current, enableAgentSync: checked }))
            }
          />
          <SetupToggle
            title="Index MCP tools"
            description="Import native MCP servers found in project configs."
            checked={settings.enableToolIndex}
            onChange={(checked) =>
              setSettings((current) => ({ ...current, enableToolIndex: checked }))
            }
          />
          <SetupToggle
            title="Collect proxy usage logs"
            description="Read tool-call logs written by TaseDeck proxy sidecars."
            checked={settings.enableLogCollection}
            onChange={(checked) =>
              setSettings((current) => ({ ...current, enableLogCollection: checked }))
            }
          />
        </YStack>

        <McpPanel p={16} gap={12} width="100%">
          <YStack gap={4} width="100%" minW={0}>
            <Text color={colors.foreground} fontSize={14} fontWeight="600" select="none">
              Node.js
            </Text>
            <Text
              color={draftValid || runtimeFound ? colors.muted : colors.warning}
              fontSize={12}
              lineHeight={18}
              select="none"
            >
              {versionLabel}
            </Text>
            <Text color={colors.muted} fontSize={12} lineHeight={18} select="none">
              MCP proxy scripts need Node.js. Choose an installed binary or download LTS.
            </Text>
          </YStack>

          <div style={{ width: "100%", minWidth: 0 }}>
            <McpDataTable
              columns={[{ key: "path", header: "Executable path" }]}
              gridColumns="minmax(0, 1fr)"
              hideHeader={false}
            >
              <McpTableRow rowId="setup-node-path">
                <McpTableCell isLastRow interactive>
                  <div style={{ width: "100%", minWidth: 0 }}>
                    <McpTableFolderPath
                      value={draftPath}
                      onChange={(value) => {
                        setDraftPath(value);
                        setError(null);
                      }}
                      onPickFolder={pickNodeExecutable}
                      resolving={validating}
                      placeholder="/usr/local/bin/node"
                      commitOnBlur={false}
                    />
                  </div>
                </McpTableCell>
              </McpTableRow>
            </McpDataTable>
          </div>

          {showDownload ? (
            <button
              type="button"
              onClick={() => void handleDownload()}
              style={{
                height: 34,
                borderRadius: 8,
                border: `1px solid ${borders.default}`,
                background: colors.surface,
                color: colors.foreground,
                padding: "0 12px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Download Node.js LTS
            </button>
          ) : null}

          {downloading ? (
            <Text color={colors.muted} fontSize={12} select="none">
              Downloading Node.js LTS…
            </Text>
          ) : null}

          {error ? (
            <Text color={colors.error} fontSize={12} select="none">
              {error}
            </Text>
          ) : null}
        </McpPanel>

        <button
          type="button"
          disabled={busy || !canContinue}
          onClick={() => void handleContinue()}
          style={{
            alignSelf: "flex-start",
            height: 36,
            borderRadius: 8,
            border: "none",
            background: colors.accent,
            color: "#fff",
            padding: "0 16px",
            cursor: busy || !canContinue ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 600,
            opacity: busy || !canContinue ? 0.45 : 1,
          }}
        >
          {busy ? "Continuing…" : "Continue"}
        </button>
      </YStack>
    </YStack>
  );
}
