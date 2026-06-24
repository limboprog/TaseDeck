import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, XStack, YStack } from "tamagui";
import {
  downloadNodeRuntime,
  getAppSettings,
  getNodeRuntimeStatus,
  pickNodeExecutable,
  setNodePath,
  validateNodePath,
  type NodeRuntimeStatus,
} from "../../services/app/appSettingsApi";
import { borders, colors } from "../../theme";
import { McpPanel } from "../mcp/McpPanel";
import { McpDataTable, McpTableRow } from "../mcp/table/McpDataTable";
import {
  McpTableCell,
  McpTableFolderPath,
  McpTableSave,
} from "../mcp/table/McpTableCells";

const NODE_PATH_GRID = "minmax(0, 1fr) 44px";

const profileButtonStyle = {
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
} as const;

type NodeRuntimePanelProps = {
  onPathSaved?: () => void;
};

function normalizePath(value: string) {
  return value.trim();
}

function formatVersion(version: string | null | undefined) {
  if (!version) {
    return null;
  }
  const trimmed = version.trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

export function NodeRuntimePanel({ onPathSaved }: NodeRuntimePanelProps) {
  const [savedPath, setSavedPath] = useState("");
  const [draftPath, setDraftPath] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<NodeRuntimeStatus | null>(null);
  const [draftVersion, setDraftVersion] = useState<string | null>(null);
  const [draftValid, setDraftValid] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [settings, status] = await Promise.all([getAppSettings(), getNodeRuntimeStatus()]);
    const path = settings.nodePath?.trim() || status.path?.trim() || "";
    setSavedPath(path);
    setDraftPath(path);
    setRuntimeStatus(status);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = useMemo(
    () => normalizePath(draftPath) !== normalizePath(savedPath),
    [draftPath, savedPath],
  );

  useEffect(() => {
    const trimmed = normalizePath(draftPath);
    if (!trimmed) {
      setDraftVersion(null);
      setDraftValid(false);
      setValidating(false);
      return;
    }

    setValidating(true);
    const timer = window.setTimeout(() => {
      void validateNodePath(trimmed)
        .then((version) => {
          setDraftVersion(version);
          setDraftValid(true);
          setError(null);
        })
        .catch((cause: unknown) => {
          setDraftVersion(null);
          setDraftValid(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => {
          setValidating(false);
        });
    }, 280);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftPath]);

  const activeVersion = useMemo(() => {
    if (isDirty) {
      return draftValid ? formatVersion(draftVersion) : null;
    }
    return formatVersion(runtimeStatus?.version);
  }, [draftValid, draftVersion, isDirty, runtimeStatus?.version]);

  const canSave = isDirty && draftValid && !saving && !validating;
  const showDownload = !runtimeStatus?.found && !draftValid && !validating && !downloading;

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const trimmed = normalizePath(draftPath);
      await setNodePath(trimmed);
      setSavedPath(trimmed);
      const status = await getNodeRuntimeStatus();
      setRuntimeStatus(status);
      onPathSaved?.();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const path = await downloadNodeRuntime();
      setDraftPath(path);
      setSavedPath(path);
      const status = await getNodeRuntimeStatus();
      setRuntimeStatus(status);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDownloading(false);
    }
  };

  const versionLabel = validating
    ? "Checking path…"
    : activeVersion
      ? activeVersion
      : runtimeStatus?.found
        ? "Detected on PATH"
        : "Not detected";

  return (
    <YStack gap={8} width="100%">
      <Text color={colors.muted} fontSize={15} fontWeight="600" select="none">
        Runtime
      </Text>

      <McpPanel p={16} gap={12} width="100%">
        <YStack gap={4} width="100%" minW={0}>
          <Text color={colors.foreground} fontSize={14} fontWeight="600" select="none">
            Node.js
          </Text>
          <Text
            color={activeVersion || runtimeStatus?.found ? colors.muted : colors.warning}
            fontSize={12}
            lineHeight={18}
            select="none"
          >
            {versionLabel}
          </Text>
          <Text color={colors.muted} fontSize={12} lineHeight={18} select="none">
            TaseDeck runs MCP proxy scripts with Node.js. Pick the executable or download the
            latest LTS build if it is not installed.
          </Text>
        </YStack>

        <div style={{ width: "100%", minWidth: 0 }}>
          <McpDataTable
            columns={[
              { key: "path", header: "Executable path" },
              { key: "save", header: "" },
            ]}
            gridColumns={NODE_PATH_GRID}
            hideHeader={false}
          >
            <McpTableRow rowId="node-path">
              <McpTableCell isLastRow interactive>
                <div style={{ width: "100%", minWidth: 0 }}>
                  <McpTableFolderPath
                    value={draftPath}
                    onChange={(value) => {
                      setDraftPath(value);
                      setError(null);
                    }}
                    onCommit={() => void handleSave()}
                    onPickFolder={pickNodeExecutable}
                    resolving={validating}
                    placeholder="/usr/local/bin/node"
                    commitOnBlur={false}
                  />
                </div>
              </McpTableCell>
              <McpTableCell isLastRow align="end">
                <McpTableSave onClick={() => void handleSave()} disabled={!canSave} />
              </McpTableCell>
            </McpTableRow>
          </McpDataTable>
        </div>

        {showDownload ? (
          <XStack gap={8} width="100%" flexWrap="wrap">
            <button
              type="button"
              disabled={downloading}
              onClick={() => void handleDownload()}
              style={{
                ...profileButtonStyle,
                opacity: downloading ? 0.55 : 1,
                cursor: downloading ? "not-allowed" : "pointer",
              }}
            >
              Download Node.js LTS
            </button>
          </XStack>
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
    </YStack>
  );
}
