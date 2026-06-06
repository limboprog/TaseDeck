import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { accentAlpha, colors, surfaces } from "../../theme";
import {
  tablePickerItemStyle,
  tablePickerPanelBodyStyle,
  tablePickerPanelShellStyle,
} from "./tablePickerStyles";
import type { TablePickerAnchor, TablePickerItemRenderProps, TablePickerOption } from "./types";

type TablePickerPanelProps<T extends string = string> = {
  open: boolean;
  anchor: TablePickerAnchor | null;
  options: TablePickerOption<T>[];
  selectedValue?: string | null;
  onPick: (option: TablePickerOption<T>) => void;
  renderItem?: (props: TablePickerItemRenderProps<T>) => ReactNode;
  emptyMessage?: string;
};

function DefaultPickerItem<T extends string>({
  option,
  selected,
  isLast,
  onPick,
}: TablePickerItemRenderProps<T>) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onMouseDown={(event) => {
        event.preventDefault();
        onPick();
      }}
      style={tablePickerItemStyle(isLast, selected)}
      onMouseEnter={(event) => {
        if (!selected) {
          event.currentTarget.style.background = surfaces.controlHover;
        }
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = selected ? accentAlpha[12] : "transparent";
      }}
    >
      {option.label}
    </button>
  );
}

export function TablePickerPanel<T extends string = string>({
  open,
  anchor,
  options,
  selectedValue = null,
  onPick,
  renderItem,
  emptyMessage,
}: TablePickerPanelProps<T>) {
  if (!open || !anchor) {
    return null;
  }

  const panel = (
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
      <div style={tablePickerPanelBodyStyle}>
        {options.length === 0 && emptyMessage ? (
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
          options.map((option, index) => {
            const isLast = index === options.length - 1;
            const selected =
              selectedValue !== null &&
              selectedValue !== undefined &&
              option.value.toLowerCase() === selectedValue.toLowerCase();
            const props: TablePickerItemRenderProps<T> = {
              option,
              selected,
              isLast,
              onPick: () => onPick(option),
            };
            return (
              <div key={option.value}>
                {renderItem ? renderItem(props) : <DefaultPickerItem {...props} />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
