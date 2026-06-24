import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { IoAdd, IoCheckmark, IoCopy, IoCopyOutline, IoFolder } from "../../../icons";
import { LoaderSpinner } from "../../../components/LoaderSpinner";
import { PaneExpandableText } from "../../../components/pane";
import { TablePickerSearch, TablePickerSelect } from "../../../components/TablePicker";
import type {
  TablePickerOption,
  TablePickerSearchProps,
  TablePickerSelectProps,
} from "../../../components/TablePicker";
import { ToolToggle } from "../../../components/ToolToggle";
import { colors, tamaguiSurfaces } from "../../../theme";
import { McpRemoveButton } from "../McpRemoveButton";
import {
  mcpTableAddButton,
  mcpTableBodyCell,
  mcpTableHeaderText,
  MCP_TABLE_BODY_FONT_SIZE,
  MCP_TABLE_BODY_LINE_HEIGHT,
  mcpTableRowBorder,
  mcpTransportRadioStyle,
  mcpTransportTitleText,
} from "../mcpTableStyles";

const LINE_HEIGHT = MCP_TABLE_BODY_LINE_HEIGHT;
const MIN_HEIGHT = 28;
const TEXT_PAD_Y = (MIN_HEIGHT - LINE_HEIGHT) / 2;

/** Keeps controls on the first row band while the grid row grows downward. */
export function McpTableFirstLine({
  children,
  align = "start",
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent:
          align === "end" ? "flex-end" : align === "center" ? "center" : "flex-start",
        minHeight: MIN_HEIGHT,
        width: "100%",
        minWidth: 0,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

export type McpTableCellProps = {
  isLastRow: boolean;
  isRowExpanded?: boolean;
  align?: "start" | "center" | "end";
  style?: CSSProperties;
  interactive?: boolean;
  children: ReactNode;
};

export function McpTableCell({
  isLastRow,
  isRowExpanded: _isRowExpanded = false,
  align = "start",
  style,
  interactive = false,
  children,
}: McpTableCellProps) {
  return (
    <div
      {...(interactive ? { "data-mcp-row-interactive": true } : {})}
      style={{
        ...mcpTableBodyCell,
        ...mcpTableRowBorder(isLastRow),
        justifyContent:
          align === "end" ? "flex-end" : align === "center" ? "center" : "flex-start",
        alignItems: "flex-start",
        overflow: "visible",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function McpTableEmptyRow({
  message,
  isLastRow = true,
}: {
  message: ReactNode;
  isLastRow?: boolean;
}) {
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        ...mcpTableBodyCell,
        ...mcpTableRowBorder(isLastRow),
      }}
    >
      {typeof message === "string" ? (
        <span style={{ color: colors.muted, fontSize: 11, fontWeight: 500 }}>{message}</span>
      ) : (
        message
      )}
    </div>
  );
}

export function McpTableAddHeader({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-mcp-row-interactive
      onClick={onClick}
      disabled={disabled}
      style={{
        ...mcpTableAddButton,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <IoAdd size={14} />
      Add
    </button>
  );
}

export function McpTablePlainText({
  value,
  placeholder = "—",
  monospace = false,
  muted = false,
  fontSize = MCP_TABLE_BODY_FONT_SIZE,
  fontWeight,
  tone = "default",
  isRowExpanded = false,
}: {
  value: string;
  placeholder?: string;
  monospace?: boolean;
  muted?: boolean;
  fontSize?: number;
  fontWeight?: number;
  tone?: "default" | "panel";
  isRowExpanded?: boolean;
}) {
  const display = value.trim() || placeholder;
  const isPlaceholder = !value.trim();

  return (
    <McpTableEllipsisText
      value={display}
      isRowExpanded={isRowExpanded}
      color={
        isPlaceholder || muted
          ? colors.muted
          : tone === "panel"
            ? colors.panelForeground
            : colors.foreground
      }
      fontSize={fontSize}
      fontWeight={fontWeight}
      monospace={monospace}
      tone={tone}
    />
  );
}

export function McpTableEllipsisText({
  value,
  isRowExpanded = false,
  color,
  fontSize = MCP_TABLE_BODY_FONT_SIZE,
  fontWeight,
  monospace = false,
  tone = "default",
  title,
}: {
  value: string;
  isRowExpanded?: boolean;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  monospace?: boolean;
  tone?: "default" | "panel";
  title?: string;
}) {
  const resolvedColor =
    color ??
    (tone === "panel" ? colors.panelForeground : colors.foreground);

  return (
    <PaneExpandableText
      value={value}
      expanded={isRowExpanded}
      color={resolvedColor}
      fontSize={fontSize}
      fontWeight={fontWeight}
      monospace={monospace}
      lineHeight={LINE_HEIGHT}
      minHeight={MIN_HEIGHT}
      title={title}
    />
  );
}

function syncTextareaHeight(node: HTMLTextAreaElement, singleLine: boolean) {
  if (singleLine) {
    node.style.height = `${MIN_HEIGHT}px`;
    return;
  }
  node.style.height = "auto";
  node.style.height = `${Math.max(MIN_HEIGHT, node.scrollHeight)}px`;
}

export function McpTableEditableText({
  value,
  onChange,
  placeholder,
  isRowExpanded = false,
  active = false,
  onActivate,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isRowExpanded?: boolean;
  active?: boolean;
  onActivate?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const singleLine = !isRowExpanded;
  const showPreview = singleLine && !editing;
  const hasValue = Boolean(value.trim());
  const valueColor = active
    ? colors.accent
    : hasValue
      ? colors.foreground
      : colors.muted;

  useEffect(() => {
    if (!editing) {
      return;
    }
    const node = textareaRef.current;
    if (!node) {
      return;
    }
    node.focus();
    const len = node.value.length;
    node.setSelectionRange(len, len);
  }, [editing]);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node || showPreview) {
      return;
    }
    syncTextareaHeight(node, singleLine);
  }, [showPreview, singleLine, value, editing]);

  if (!isRowExpanded) {
    return (
      <McpTableEllipsisText
        value={hasValue ? value : (placeholder ?? "")}
        isRowExpanded={false}
        color={valueColor}
        monospace
      />
    );
  }

  return (
    <div
      data-mcp-row-interactive
      style={{ position: "relative", width: "100%", minWidth: 0, minHeight: MIN_HEIGHT }}
      onFocus={() => onActivate?.()}
    >
      {showPreview ? (
        <span
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: TEXT_PAD_Y,
            height: LINE_HEIGHT,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 12,
            lineHeight: `${LINE_HEIGHT}px`,
            fontFamily: "ui-monospace, monospace",
            color: valueColor,
            cursor: "text",
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            onActivate?.();
            setEditing(true);
          }}
        >
          {hasValue ? value.split("\n")[0] : placeholder}
        </span>
      ) : null}
      <textarea
        ref={textareaRef}
        data-mcp-row-interactive
        readOnly={!editing}
        value={value}
        placeholder={placeholder}
        rows={1}
        onFocus={() => {
          onActivate?.();
          setEditing(true);
        }}
        onBlur={() => setEditing(false)}
        onChange={(event) => {
          if (!editing) {
            return;
          }
          onChange(event.target.value);
          syncTextareaHeight(event.currentTarget, singleLine);
        }}
        onMouseDown={(event) => {
          if (editing) {
            return;
          }
          event.preventDefault();
          onActivate?.();
          setEditing(true);
        }}
        style={{
          width: "100%",
          minWidth: 0,
          margin: 0,
          padding: `${TEXT_PAD_Y}px 0`,
          border: "none",
          outline: "none",
          resize: "none",
          background: "transparent",
          color: valueColor,
          fontSize: 12,
          lineHeight: `${LINE_HEIGHT}px`,
          fontFamily: "ui-monospace, monospace",
          boxSizing: "border-box",
          minHeight: MIN_HEIGHT,
          height: singleLine ? MIN_HEIGHT : undefined,
          overflow: singleLine ? "hidden" : "auto",
          whiteSpace: isRowExpanded ? "pre-wrap" : "nowrap",
          cursor: "text",
          ...(showPreview
            ? { position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" }
            : {}),
        }}
      />
    </div>
  );
}

export function McpTableRadio({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <McpTableFirstLine align="center">
      <input
        type="radio"
        data-mcp-row-interactive
        checked={checked}
        onChange={onChange}
        aria-label={label}
        style={mcpTransportRadioStyle(checked)}
      />
    </McpTableFirstLine>
  );
}

export function McpTableTransportLabel({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <McpTableFirstLine>
      <span
        style={{
          ...mcpTransportTitleText,
          color: active ? colors.accent : colors.muted,
        }}
      >
        {label}
      </span>
    </McpTableFirstLine>
  );
}

export function McpTableRemove({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  return (
    <McpTableFirstLine align="end">
      <div data-mcp-row-interactive>
        <McpRemoveButton onClick={onClick} ariaLabel={ariaLabel} />
      </div>
    </McpTableFirstLine>
  );
}

export function McpTableSave({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <McpTableFirstLine align="end">
      <button
        type="button"
        data-mcp-row-interactive
        onClick={onClick}
        disabled={disabled}
        aria-label="Save"
        style={{
          width: 28,
          height: 28,
          border: "none",
          borderRadius: 6,
          background: "transparent",
          color: colors.accent,
          cursor: disabled ? "not-allowed" : "pointer",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.35 : 1,
        }}
      >
        <IoCheckmark size={14} />
      </button>
    </McpTableFirstLine>
  );
}

export function McpTableToggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <div data-mcp-row-interactive>
      <ToolToggle checked={checked} onChange={onChange} ariaLabel={ariaLabel} />
    </div>
  );
}

export function McpTableRunAction({
  loading,
  disabled = false,
  onClick,
}: {
  loading: boolean;
  disabled?: boolean;
  onClick: (event: MouseEvent) => void;
}) {
  return (
    <McpTableFirstLine align="end">
      {loading ? (
        <div data-mcp-row-interactive>
          <LoaderSpinner size={18} ariaLabel="Running test" />
        </div>
      ) : (
        <button
          type="button"
          data-mcp-row-interactive
          disabled={disabled}
          onClick={onClick}
          style={{
            border: "none",
            background: "transparent",
            color: disabled ? `${colors.accent}66` : colors.accent,
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled ? "default" : "pointer",
            padding: 0,
            opacity: disabled ? 0.55 : 1,
          }}
        >
          Run
        </button>
      )}
    </McpTableFirstLine>
  );
}

export function McpTableCopyAction({
  copied,
  onClick,
}: {
  copied: boolean;
  onClick: (event: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      data-mcp-row-interactive
      aria-label="Copy result"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        flexShrink: 0,
        marginTop: -2,
        border: "none",
        borderRadius: 6,
        background: "transparent",
        color: copied ? colors.accent : colors.muted,
        cursor: "pointer",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = tamaguiSurfaces.controlHoverBg;
        event.currentTarget.style.color = colors.foreground;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
        event.currentTarget.style.color = copied ? colors.accent : colors.muted;
      }}
    >
      <IoCopy size={13} />
    </button>
  );
}

export const mcpTableInputStyle: CSSProperties = {
  width: "100%",
  height: 28,
  margin: 0,
  padding: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: colors.foreground,
  fontSize: 12,
  fontFamily: "inherit",
};

export function McpTableInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  monospace = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  monospace?: boolean;
}) {
  return (
    <input
      data-mcp-row-interactive
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      style={{
        ...mcpTableInputStyle,
        fontFamily: monospace ? "ui-monospace, monospace" : "inherit",
      }}
    />
  );
}

export function McpTableHeaderLabel({ children }: { children: string }) {
  return <span style={mcpTableHeaderText}>{children}</span>;
}

export function McpTableIconText({
  icon,
  value,
  fontSize = 13,
  fontWeight = 500,
}: {
  icon: ReactNode;
  value: string;
  fontSize?: number;
  fontWeight?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0 }}>
      {icon}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: colors.foreground,
          fontSize,
          fontWeight,
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export function McpTablePickerSearch<T extends string = string>(
  props: TablePickerSearchProps<T>,
) {
  return <TablePickerSearch {...props} />;
}

export function McpTablePickerSelect<T extends string = string>(
  props: TablePickerSelectProps<T>,
) {
  return <TablePickerSelect {...props} />;
}

export type { TablePickerOption };

export function McpTableFolderPath({
  value,
  onChange,
  onCommit,
  onPickFolder,
  resolving = false,
  commitOnBlur = true,
  placeholder = "Folder path",
}: {
  value: string;
  onChange?: (value: string) => void;
  onCommit?: () => void;
  onPickFolder: () => Promise<string | null>;
  resolving?: boolean;
  commitOnBlur?: boolean;
  placeholder?: string;
}) {
  return (
    <McpTablePathPicker
      value={value}
      onChange={onChange}
      onCommit={onCommit}
      onPick={onPickFolder}
      resolving={resolving}
      commitOnBlur={commitOnBlur}
      placeholder={placeholder}
    />
  );
}

export function McpTablePathPicker({
  value,
  onChange,
  onCommit,
  onPick,
  resolving = false,
  commitOnBlur = true,
  placeholder = "Path",
}: {
  value: string;
  onChange?: (value: string) => void;
  onCommit?: () => void;
  onPick: () => Promise<string | null>;
  resolving?: boolean;
  commitOnBlur?: boolean;
  placeholder?: string;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit?.();
    }
  };

  const handleChoose = async () => {
    const picked = await onPick();
    if (picked) {
      onChange?.(picked);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", minWidth: 0 }}>
      <button
        type="button"
        data-mcp-row-interactive
        onClick={() => void handleChoose()}
        aria-label="Choose path"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          margin: 0,
          padding: 0,
          border: "none",
          borderRadius: 6,
          background: "transparent",
          color: colors.muted,
          cursor: "pointer",
          flexShrink: 0,
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = tamaguiSurfaces.controlHoverBg;
          event.currentTarget.style.color = colors.foreground;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = "transparent";
          event.currentTarget.style.color = colors.muted;
        }}
      >
        <IoFolder size={15} />
      </button>
      <input
        data-mcp-row-interactive
        value={value}
        readOnly={!onChange}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        onBlur={commitOnBlur ? () => onCommit?.() : undefined}
        onKeyDown={onChange ? handleKeyDown : undefined}
        placeholder={resolving ? "Searching…" : placeholder}
        title={value || undefined}
        style={{
          ...mcpTableInputStyle,
          flex: 1,
          minWidth: 0,
          height: 28,
          fontFamily: "ui-monospace, monospace",
        }}
      />
    </div>
  );
}

export function McpTableHeaderCopy({
  value,
  disabled = false,
}: {
  value: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      data-mcp-row-interactive
      onClick={() => void copy()}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        border: "none",
        background: "transparent",
        color: copied ? colors.accent : colors.muted,
        fontSize: 11,
        fontWeight: 500,
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseEnter={(event) => {
        if (disabled || copied) {
          return;
        }
        event.currentTarget.style.color = colors.foreground;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.color = copied ? colors.accent : colors.muted;
      }}
    >
      <IoCopyOutline size={14} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
