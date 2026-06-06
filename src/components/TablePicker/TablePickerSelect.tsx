import { useEffect, useRef, useState } from "react";
import { colors } from "../../theme";
import { TablePickerPanel } from "./TablePickerPanel";
import { tablePickerSelectTriggerStyle } from "./tablePickerStyles";
import type { TablePickerSelectProps } from "./types";
import { useTablePicker } from "./useTablePicker";

export function TablePickerSelect<T extends string = string>({
  value,
  options,
  onSelect,
  placeholder = "Select…",
  autoOpen = false,
  disabled = false,
  renderItem,
}: TablePickerSelectProps<T>) {
  const [open, setOpen] = useState(autoOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { anchor, measureAnchor } = useTablePicker(triggerRef, open, setOpen);

  useEffect(() => {
    if (autoOpen) {
      setOpen(true);
      measureAnchor();
    }
  }, [autoOpen, measureAnchor]);

  const selected = options.find((option) => option.value === value);
  const label = selected?.label ?? placeholder;
  const muted = !selected;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-mcp-row-interactive
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            return;
          }
          setOpen((current) => !current);
          measureAnchor();
        }}
        style={{
          ...tablePickerSelectTriggerStyle,
          color: muted ? colors.muted : colors.foreground,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </button>
      <TablePickerPanel
        open={open && !disabled}
        anchor={anchor}
        options={options}
        selectedValue={value}
        onPick={(option) => {
          onSelect(option);
          setOpen(false);
        }}
        renderItem={renderItem}
      />
    </>
  );
}
