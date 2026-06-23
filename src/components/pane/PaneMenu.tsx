import { createPortal } from "react-dom";
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { IoChevronForward } from "../../icons";
import { useTablePicker } from "../TablePicker";
import {
  tablePickerItemStyle,
  tablePickerPanelBodyStyle,
  tablePickerPanelShellStyle,
} from "../TablePicker/tablePickerStyles";
import { mcpTableRowLine } from "../../features/mcp/mcpTableStyles";
import { borders, colors, surfaces } from "../../theme";
import { ToolbarChevron } from "../toolbar/ToolbarChevron";
import { PaneEllipsis, paneEllipsisStyle } from "./PaneExpandableText";
import {
  PANE_TOOLBAR_DROPDOWN_MIN_WIDTH,
  PANE_TOOLBAR_ITEM_HEIGHT,
  PANE_TOOLBAR_ITEM_RADIUS,
  paneToolbarButtonBase,
} from "./paneStyles";

export type PaneMenuLeaf = {
  key: string;
  label: string;
  onPick: () => void;
};

export type PaneMenuGroup = {
  type: "group";
  id: string;
  label: string;
  items: PaneMenuLeaf[];
  emptyMessage?: string;
};

export type PaneMenuItem = {
  type: "item";
  key: string;
  label: string;
  onPick: () => void;
};

export type PaneMenuRow = PaneMenuItem | PaneMenuGroup;

type PaneMenuProps = {
  label: string;
  rows: PaneMenuRow[];
  disabled?: boolean;
  emptyMessage?: string;
  minWidth?: number;
  mainColumnWidth?: number;
  subColumnWidth?: number;
  fontWeight?: number;
  onOpen?: () => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
};

const MENU_ROW_HEIGHT = PANE_TOOLBAR_ITEM_HEIGHT;
const PANEL_GAP = 6;
const PANEL_RADIUS = 8;

function isGroup(row: PaneMenuRow): row is PaneMenuGroup {
  return row.type === "group";
}

function paneMenuTriggerStyle(
  disabled: boolean,
  triggerMinWidth: number,
  fontWeight: number,
): CSSProperties {
  return {
    ...paneToolbarButtonBase(disabled),
    justifyContent: "space-between",
    gap: 10,
    minWidth: triggerMinWidth,
    height: PANE_TOOLBAR_ITEM_HEIGHT,
    padding: "0 12px",
    borderRadius: PANE_TOOLBAR_ITEM_RADIUS,
    background: "transparent",
    color: colors.foreground,
    fontSize: 13,
    fontWeight,
  };
}

function menuRowStyle(isLast: boolean, active = false): CSSProperties {
  return {
    ...tablePickerItemStyle(isLast, active),
    display: "flex",
    alignItems: "center",
    minWidth: 0,
    minHeight: MENU_ROW_HEIGHT,
    height: MENU_ROW_HEIGHT,
    padding: "0 12px",
    flexShrink: 0,
  };
}

function paneMenuPanelStyle(left: number, top: number, width: number): CSSProperties {
  return {
    ...tablePickerPanelShellStyle,
    left,
    top: top + PANEL_GAP,
    width,
    borderTop: `1px solid ${borders.default}`,
    borderRadius: PANEL_RADIUS,
  };
}

function PaneMenuLeafButton({
  item,
  isLast,
  onPick,
}: {
  item: PaneMenuLeaf;
  isLast: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      style={menuRowStyle(isLast)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = surfaces.controlHover;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
    >
      <PaneEllipsis>{item.label}</PaneEllipsis>
    </button>
  );
}

export function PaneMenu({
  label,
  rows,
  disabled = false,
  emptyMessage,
  minWidth = PANE_TOOLBAR_DROPDOWN_MIN_WIDTH,
  mainColumnWidth = 132,
  subColumnWidth = 200,
  fontWeight = 400,
  onOpen,
  onPointerDown,
}: PaneMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { anchor, measureAnchor } = useTablePicker(triggerRef, open, setOpen);

  const groups = rows.filter(isGroup);
  const hasGroups = groups.length > 0;
  const flatItems = rows.filter((row): row is PaneMenuItem => row.type === "item");

  const activeGroup =
    groups.find((group) => group.id === activeGroupId) ?? null;

  const close = () => {
    setOpen(false);
    setActiveGroupId(null);
  };

  const panelWidth = hasGroups
    ? activeGroup
      ? mainColumnWidth + subColumnWidth
      : mainColumnWidth
    : Math.max(anchor?.width ?? minWidth, minWidth);

  const panel =
    open && anchor && !disabled ? (
      <div
        role="listbox"
        data-table-picker
        data-pane-menu
        style={paneMenuPanelStyle(anchor.left, anchor.top, panelWidth)}
      >
        <div
          style={{
            ...tablePickerPanelBodyStyle,
            flexDirection: hasGroups ? "row" : "column",
            alignItems: "stretch",
            width: "100%",
            maxHeight: hasGroups ? 280 : 220,
          }}
        >
          {hasGroups ? (
            <>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: mainColumnWidth,
                  flexShrink: 0,
                }}
              >
                {groups.map((group, index) => {
                  const isLast = index === groups.length - 1 && !activeGroup;
                  const active = activeGroupId === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      style={{
                        ...menuRowStyle(isLast, active),
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                      onMouseEnter={() => setActiveGroupId(group.id)}
                      onFocus={() => setActiveGroupId(group.id)}
                    >
                      <span style={paneEllipsisStyle()}>{group.label}</span>
                      <IoChevronForward
                        size={14}
                        color={active ? colors.accent : colors.muted}
                      />
                    </button>
                  );
                })}
              </div>

              {activeGroup ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: subColumnWidth,
                    flexShrink: 0,
                    overflowY: "auto",
                    borderLeft: mcpTableRowLine,
                  }}
                  onMouseEnter={() => setActiveGroupId(activeGroup.id)}
                >
                  {activeGroup.items.length === 0 ? (
                    <div
                      style={{
                        padding: "8px 12px",
                        fontSize: 12,
                        color: colors.muted,
                        lineHeight: 1.4,
                      }}
                    >
                      {activeGroup.emptyMessage ?? "No items"}
                    </div>
                  ) : (
                    activeGroup.items.map((item, index) => {
                      const isLast = index === activeGroup.items.length - 1;
                      return (
                        <PaneMenuLeafButton
                          key={item.key}
                          item={item}
                          isLast={isLast}
                          onPick={() => {
                            item.onPick();
                            close();
                          }}
                        />
                      );
                    })
                  )}
                </div>
              ) : null}
            </>
          ) : flatItems.length === 0 && emptyMessage ? (
            <div
              style={{
                padding: "8px 12px",
                fontSize: 11,
                color: colors.muted,
              }}
            >
              {emptyMessage}
            </div>
          ) : (
            flatItems.map((item, index) => {
              const isLast = index === flatItems.length - 1;
              return (
                <PaneMenuLeafButton
                  key={item.key}
                  item={item}
                  isLast={isLast}
                  onPick={() => {
                    item.onPick();
                    close();
                  }}
                />
              );
            })
          )}
        </div>
      </div>
    ) : null;

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        data-toolbar-interactive
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        style={paneMenuTriggerStyle(disabled, minWidth, fontWeight)}
        onPointerDown={onPointerDown}
        onClick={() => {
          if (disabled) {
            return;
          }
          setOpen((current) => {
            const next = !current;
            if (next) {
              onOpen?.();
            } else {
              setActiveGroupId(null);
            }
            return next;
          });
          measureAnchor();
        }}
      >
        <span>{label}</span>
        <ToolbarChevron expanded={open} />
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

export function paneMenuItemsFromOptions(
  options: Array<{ value: string; label: string }>,
  onPick: (value: string) => void,
): PaneMenuItem[] {
  return options.map((option) => ({
    type: "item" as const,
    key: option.value,
    label: option.label,
    onPick: () => onPick(option.value),
  }));
}
