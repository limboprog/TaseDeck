import { memo, useRef, useState } from "react";
import { BiLoaderAlt } from "../../icons";
import type { McpServerEntry } from "../../services/mcp_registry";
import {
  addRegistryServer,
  canAddRegistryEntry,
  isRegistryEntryInstalled,
  useInstalledMcpPaths,
} from "../../services/mcp_installed";
import { colors, market, surfaces, tamaguiSurfaces } from "../../theme";

type McpAddButtonProps = {
  entry: McpServerEntry;
  compact?: boolean;
  onAdded?: () => void;
};

const COMPACT = { minWidth: 48, height: 26, fontSize: 11, spinner: 14 };
const DEFAULT = { minWidth: 54, height: 30, fontSize: 12, spinner: 16 };

function McpAddButtonInner({
  entry,
  compact = false,
  onAdded,
}: McpAddButtonProps) {
  const installedPaths = useInstalledMcpPaths();
  const addingRef = useRef(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdd = canAddRegistryEntry(entry);
  const isAdded = isRegistryEntryInstalled(entry, installedPaths);
  const size = compact ? COMPACT : DEFAULT;

  if (!canAdd) {
    return null;
  }

  const handleAdd = () => {
    if (isAdded || addingRef.current) {
      return;
    }

    addingRef.current = true;
    setError(null);
    setAdding(true);

    void addRegistryServer(entry)
      .then(() => {
        onAdded?.();
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        addingRef.current = false;
        setAdding(false);
      });
  };

  if (adding) {
    return (
      <span
        className="mcp-add-spinner-wrap"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size.height,
          height: size.height,
          flexShrink: 0,
        }}
        aria-label="Adding MCP server"
      >
        <BiLoaderAlt
          size={size.spinner}
          color={colors.accent}
          className="mcp-add-spinner"
          aria-hidden
        />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleAdd();
        }}
        disabled={isAdded}
        aria-label={isAdded ? "MCP server added" : "Add MCP server"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: size.minWidth,
          height: size.height,
          margin: 0,
          padding: "0 10px",
          borderRadius: 999,
          border: `1px solid ${isAdded ? market.installedBorder : tamaguiSurfaces.controlHoverBg}`,
          background: isAdded ? market.installedBg : surfaces.card,
          color: isAdded ? market.installedText : colors.muted,
          fontSize: size.fontSize,
          fontWeight: 500,
          lineHeight: 1,
          cursor: isAdded ? "default" : "pointer",
          flexShrink: 0,
        }}
      >
        <span style={{ display: "block", lineHeight: 1 }}>{isAdded ? "Added" : "Add"}</span>
      </button>
      {error && !compact ? (
        <span style={{ display: "block", color: colors.error, fontSize: 12, marginTop: 6 }}>
          {error}
        </span>
      ) : null}
    </>
  );
}

export const McpAddButton = memo(
  McpAddButtonInner,
  (prev, next) =>
    prev.entry === next.entry &&
    prev.compact === next.compact &&
    prev.onAdded === next.onAdded,
);
