import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  extractEnvRefAtCursor,
  isKnownEnvKey,
  listEnvKeysForAutocomplete,
} from "../../services/mcp_installed/runCommands";
import { ENV_VARIABLES_CONFIG_KEY, parseStoredEnvRows } from "../../services/mcp_installed/storedEnv";
import { accentAlpha, colors, surfaces } from "../../theme";
import { mcpTableRowLine } from "./mcpTableStyles";
import {
  tablePickerPanelBodyStyle,
  tablePickerPanelShellStyle,
} from "../../components/TablePicker/tablePickerStyles";

type EnvTemplateInputProps = {
  value: string;
  onChange: (value: string) => void;
  env: Record<string, string>;
  placeholder?: string;
  style?: CSSProperties;
  monospace?: boolean;
  dimmed?: boolean;
  /** Selected run profile — accent text color. */
  active?: boolean;
};

function renderHighlightedValue(
  value: string,
  env: Record<string, string>,
  dimmed: boolean,
) {
  const parts: Array<{ text: string; known: boolean }> = [];
  const pattern = /\$\{([^}]*)\}/g;
  let last = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ text: value.slice(last, index), known: false });
    }
    const name = (match[1] ?? "").trim();
    parts.push({
      text: match[0],
      known: !dimmed && name.length > 0 && isKnownEnvKey(name, env),
    });
    last = index + match[0].length;
  }
  if (last < value.length) {
    parts.push({ text: value.slice(last), known: false });
  }
  return parts;
}

type AnchorRect = {
  left: number;
  top: number;
  width: number;
};

function measureInputPrefixWidth(input: HTMLInputElement, prefix: string): number {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return 0;
  }
  const style = getComputedStyle(input);
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return context.measureText(prefix).width;
}

export function EnvTemplateInput({
  value,
  onChange,
  env,
  placeholder,
  style,
  monospace = false,
  dimmed = false,
  active = false,
}: EnvTemplateInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [menu, setMenu] = useState<{
    query: string;
    start: number;
    end: number;
    keys: string[];
  } | null>(null);

  const envSnapshot = env[ENV_VARIABLES_CONFIG_KEY] ?? "";
  const envRef = useRef(env);
  envRef.current = env;

  const refreshMenu = useCallback(() => {
    const node = inputRef.current;
    if (!node || !focused) {
      setMenu(null);
      return;
    }
    const ref = extractEnvRefAtCursor(value, node.selectionStart ?? value.length);
    if (!ref) {
      setMenu(null);
      return;
    }
    const envNow = envRef.current;
    const allKeys = listEnvKeysForAutocomplete(envNow, parseStoredEnvRows(envNow));
    const keys = allKeys.filter((key) =>
      key.toLowerCase().includes(ref.query.toLowerCase()),
    );
    setMenu({ ...ref, keys });
  }, [envSnapshot, focused, value]);

  useEffect(() => {
    refreshMenu();
  }, [refreshMenu]);

  const menuOpen = Boolean(menu && focused);

  useEffect(() => {
    if (!menuOpen || !menu) {
      setAnchor(null);
      return;
    }
    const measure = () => {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      const rect = input.getBoundingClientRect();
      const prefixWidth = measureInputPrefixWidth(input, value.slice(0, menu.start));
      const left = rect.left + prefixWidth - input.scrollLeft;
      const remaining = Math.max(rect.right - left, 160);
      setAnchor({
        left,
        top: rect.bottom,
        width: Math.min(320, remaining),
      });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [menu, menuOpen, value]);

  const insertKey = (key: string) => {
    if (!menu) {
      return;
    }
    const insertion = `\${${key}}`;
    const next = `${value.slice(0, menu.start)}${insertion}${value.slice(menu.end)}`;
    onChange(next);
    setMenu(null);
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) {
        return;
      }
      const pos = menu.start + insertion.length;
      node.focus();
      node.setSelectionRange(pos, pos);
    });
  };

  const fontFamily = monospace
    ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    : "inherit";

  const showHighlight = value.includes("${");
  const textColor = dimmed ? colors.muted : active ? colors.accent : colors.foreground;

  const pickerPanel =
    menuOpen && anchor && menu
      ? createPortal(
          <div
            role="listbox"
            data-table-picker
            data-mcp-row-interactive
            style={{
              ...tablePickerPanelShellStyle,
              left: anchor.left,
              top: anchor.top,
              width: anchor.width,
            }}
          >
            <div style={{ ...tablePickerPanelBodyStyle, maxHeight: 200 }}>
              {menu.keys.length === 0 ? (
                <div
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    fontSize: 11,
                    color: colors.muted,
                    borderBottom: mcpTableRowLine,
                  }}
                >
                  No environment variables yet
                </div>
              ) : (
                menu.keys.map((key, index) => {
                  const selected = key.toLowerCase() === menu.query.toLowerCase();
                  const known = isKnownEnvKey(key, envRef.current);
                  const isLast = index === menu.keys.length - 1;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertKey(key);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        boxSizing: "border-box",
                        textAlign: "left",
                        padding: "10px 12px",
                        border: "none",
                        borderBottom: isLast ? "none" : mcpTableRowLine,
                        background: selected ? accentAlpha[12] : "transparent",
                        color: known || selected ? colors.accent : colors.foreground,
                        fontSize: 12,
                        fontWeight: 400,
                        fontFamily: "ui-monospace, monospace",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(event) => {
                        if (!selected) {
                          event.currentTarget.style.background = surfaces.controlHover;
                        }
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.background = selected
                          ? accentAlpha[12]
                          : "transparent";
                      }}
                    >
                      {key}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      {showHighlight ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            fontSize: 12,
            lineHeight: "28px",
            fontFamily,
            pointerEvents: "none",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {renderHighlightedValue(value, env, dimmed).map((part, index) => (
            <span
              key={`${index}-${part.text}`}
              style={{ color: part.known ? colors.accent : textColor }}
            >
              {part.text}
            </span>
          ))}
        </div>
      ) : null}

      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onSelect={refreshMenu}
        onKeyUp={refreshMenu}
        onClick={refreshMenu}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          window.setTimeout(() => setMenu(null), 150);
        }}
        placeholder={placeholder}
        style={{
          width: "100%",
          height: 28,
          border: "none",
          outline: "none",
          background: "transparent",
          color: showHighlight ? "transparent" : textColor,
          caretColor: textColor,
          fontSize: 12,
          fontWeight: 400,
          fontFamily,
          position: "relative",
          zIndex: 1,
          ...style,
        }}
      />

      {pickerPanel}
    </div>
  );
}
