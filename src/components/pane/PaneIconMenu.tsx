import { createPortal } from "react-dom";
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { IoChevronForward, IoCheckmark, IoCopyOutline, IoTrash, MdOutlineMoreHoriz, MdSettingsBackupRestore } from "../../icons";
import { useTablePicker } from "../TablePicker";
import {
  tablePickerItemStyle,
  tablePickerPanelBodyStyle,
  tablePickerPanelShellStyle,
} from "../TablePicker/tablePickerStyles";
import { mcpTableRowLine } from "../../features/mcp/mcpTableStyles";
import { borders, colors, dangerAlpha, surfaces } from "../../theme";
import { PaneEllipsis, paneEllipsisStyle } from "./PaneExpandableText";
import {
  PANE_TOOLBAR_ITEM_HEIGHT,
  PANE_TOOLBAR_ITEM_RADIUS,
  paneToolbarIconButtonStyle,
} from "./paneStyles";

export type PaneIconMenuLeaf = {
  key: string;
  label: string;
  danger?: boolean;
  icon?: "trash" | "copy" | "restore";
  selected?: boolean;
  disabled?: boolean;
  onPick: () => void;
};

export type PaneIconMenuGroup = {
  type: "group";
  id: string;
  label: string;
  items: PaneIconMenuLeaf[];
  emptyMessage?: string;
  disabled?: boolean;
};

export type PaneIconMenuItem = {
  type: "item";
  key: string;
  label: string;
  danger?: boolean;
  icon?: "trash" | "copy" | "restore";
  selected?: boolean;
  disabled?: boolean;
  onPick: () => void;
};

export type PaneIconMenuRow = PaneIconMenuItem | PaneIconMenuGroup;

type PaneIconMenuProps = {
  ariaLabel: string;
  rows: PaneIconMenuRow[];
  disabled?: boolean;
  emptyMessage?: string;
  mainColumnWidth?: number;
  subColumnWidth?: number;
  onOpen?: () => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
};

const MENU_ROW_HEIGHT = PANE_TOOLBAR_ITEM_HEIGHT;
const PANEL_GAP = 6;
const PANEL_RADIUS = 8;

function isGroup(row: PaneIconMenuRow): row is PaneIconMenuGroup {
  return row.type === "group";
}

function menuRowStyle(
  isLast: boolean,
  active = false,
  danger = false,
  disabled = false,
): CSSProperties {
  return {
    ...tablePickerItemStyle(isLast, active),
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    minHeight: MENU_ROW_HEIGHT,
    height: MENU_ROW_HEIGHT,
    padding: "0 12px",
    flexShrink: 0,
    color: disabled ? colors.muted : danger ? colors.error : colors.foreground,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "default" : "pointer",
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

function PaneIconMenuLeafButton({
  item,
  isLast,
  onPick,
  onHoverStart,
}: {
  item: PaneIconMenuLeaf;
  isLast: boolean;
  onPick: () => void;
  onHoverStart?: () => void;
}) {
  return (
    <button
      type="button"
      style={menuRowStyle(isLast, item.selected, item.danger, item.disabled)}
      disabled={item.disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!item.disabled) {
          onPick();
        }
      }}
      onMouseEnter={(event) => {
        if (item.disabled) {
          return;
        }
        onHoverStart?.();
        event.currentTarget.style.background = item.danger ? dangerAlpha[12] : surfaces.controlHover;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
    >
      {item.icon === "trash" ? <IoTrash size={14} /> : null}
      {item.icon === "copy" ? <IoCopyOutline size={14} /> : null}
      {item.icon === "restore" ? <MdSettingsBackupRestore size={14} /> : null}
      <PaneEllipsis>{item.label}</PaneEllipsis>
      {item.selected ? (
        <IoCheckmark size={14} style={{ flexShrink: 0, marginLeft: "auto" }} />
      ) : null}
    </button>
  );
}

export function PaneIconMenu({
  ariaLabel,
  rows,
  disabled = false,
  emptyMessage,
  mainColumnWidth = 132,
  subColumnWidth = 200,
  onOpen,
  onPointerDown,
}: PaneIconMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { anchor, measureAnchor } = useTablePicker(triggerRef, open, setOpen);

  const groups = rows.filter(isGroup);
  const hasGroups = groups.length > 0;

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;

  const close = () => {
    setOpen(false);
    setActiveGroupId(null);
  };

  const clearActiveGroup = () => {
    setActiveGroupId(null);
  };

  const panelWidth = hasGroups
    ? activeGroup
      ? mainColumnWidth + subColumnWidth
      : mainColumnWidth
    : Math.max(anchor?.width ?? 156, 156);

  const panel =
    open && anchor && !disabled ? (
      <div
        role="menu"
        data-table-picker
        data-pane-icon-menu
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
                {rows.map((row, index) => {
                  const isLast = index === rows.length - 1 && !activeGroup;
                  if (row.type === "item") {
                    return (
                      <PaneIconMenuLeafButton
                        key={row.key}
                        item={row}
                        isLast={isLast}
                        onHoverStart={clearActiveGroup}
                        onPick={() => {
                          row.onPick();
                          close();
                        }}
                      />
                    );
                  }
                  const active = !row.disabled && activeGroupId === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      disabled={row.disabled}
                      style={{
                        ...menuRowStyle(isLast, active, false, row.disabled),
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                      onMouseEnter={() => {
                        if (!row.disabled) {
                          setActiveGroupId(row.id);
                        }
                      }}
                      onFocus={() => {
                        if (!row.disabled) {
                          setActiveGroupId(row.id);
                        }
                      }}
                      onMouseLeave={(event) => {
                        const next = event.relatedTarget;
                        if (
                          next instanceof Node &&
                          event.currentTarget.parentElement?.contains(next)
                        ) {
                          return;
                        }
                        if (activeGroupId === row.id) {
                          setActiveGroupId(null);
                        }
                      }}
                    >
                      <span style={paneEllipsisStyle()}>{row.label}</span>
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
                  onMouseLeave={(event) => {
                    const next = event.relatedTarget;
                    const panel = event.currentTarget.parentElement;
                    if (next instanceof Node && panel?.contains(next)) {
                      return;
                    }
                    setActiveGroupId(null);
                  }}
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
                        <PaneIconMenuLeafButton
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
          ) : rows.length === 0 && emptyMessage ? (
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
            rows
              .filter((row): row is PaneIconMenuItem => row.type === "item")
              .map((item, index, items) => {
              const isLast = index === items.length - 1;
              return (
                <PaneIconMenuLeafButton
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
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          ...paneToolbarIconButtonStyle(disabled),
          borderRadius: PANE_TOOLBAR_ITEM_RADIUS,
        }}
        onPointerDown={onPointerDown}
        onClick={(event) => {
          event.stopPropagation();
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
        <MdOutlineMoreHoriz size={16} color={colors.muted} />
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
