import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Text, XStack, YStack } from "tamagui";
import { blocks, colors, surfaces, tamaguiSurfaces } from "../../theme";

const LINE_HEIGHT = 18;
const SINGLE_LINE_HEIGHT = 36;
const MAX_EDIT_HEIGHT = 200;

type EditableCommandBlockProps = {
  value: string;
  onChange: (value: string) => void;
  /** Inner bar label (shell), like table column header row. */
  shellLabel?: string;
};

function collapsedPreview(value: string, placeholder: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return placeholder;
  }
  const firstLine = trimmed.split(/\r?\n/)[0] ?? "";
  const hasMore = trimmed.includes("\n") || trimmed.length > firstLine.length;
  return hasMore ? `${firstLine}…` : firstLine;
}

export function EditableCommandBlock({
  value,
  onChange,
  shellLabel = "bash",
}: EditableCommandBlockProps) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const node = textareaRef.current;
    if (!node) {
      return;
    }
    node.style.height = "auto";
    const next = Math.min(MAX_EDIT_HEIGHT, Math.max(SINGLE_LINE_HEIGHT, node.scrollHeight));
    node.style.height = `${next}px`;
  }, []);

  useEffect(() => {
    if (editing) {
      syncHeight();
    }
  }, [editing, value, syncHeight]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [value]);

  const placeholder = "npx -y @modelcontextprotocol/server-filesystem /path";
  const preview = collapsedPreview(value, placeholder);

  return (
    <YStack style={blocks.commandTerminal}>
      <XStack
        justify="space-between"
        items="center"
        px={12}
        py={8}
        style={blocks.commandTerminalHeader}
      >
        <Text color={colors.muted} fontSize={11} fontWeight="500" select="none">
          {shellLabel}
        </Text>
        <Button
          unstyled
          px={8}
          py={4}
          rounded={6}
          bg={tamaguiSurfaces.controlHoverBg}
          hoverStyle={{ bg: tamaguiSurfaces.controlHoverStrongBg }}
          onPress={() => void copy()}
        >
          <Text color={colors.foreground} fontSize={11} select="none">
            {copied ? "Copied" : "Copy"}
          </Text>
        </Button>
      </XStack>

      {editing ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            syncHeight();
          }}
          onBlur={() => setEditing(false)}
          rows={1}
          spellCheck={false}
          placeholder={placeholder}
          style={{
            width: "100%",
            minHeight: SINGLE_LINE_HEIGHT,
            maxHeight: MAX_EDIT_HEIGHT,
            margin: 0,
            padding: "9px 12px",
            resize: "none",
            border: "none",
            outline: "none",
            overflow: "auto",
            background: surfaces.command,
            color: colors.foreground,
            fontSize: 12,
            lineHeight: `${LINE_HEIGHT}px`,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            width: "100%",
            minHeight: SINGLE_LINE_HEIGHT,
            margin: 0,
            padding: "9px 12px",
            border: "none",
            outline: "none",
            background: surfaces.command,
            color: value.trim() ? colors.foreground : colors.muted,
            fontSize: 12,
            lineHeight: `${LINE_HEIGHT}px`,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            textAlign: "left",
            cursor: "text",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {preview}
        </button>
      )}
    </YStack>
  );
}
