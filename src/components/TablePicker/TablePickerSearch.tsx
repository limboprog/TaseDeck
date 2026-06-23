import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { TablePickerPanel } from "./TablePickerPanel";
import { tablePickerSearchInputStyle } from "./tablePickerStyles";
import type { TablePickerSearchProps } from "./types";
import { useTablePicker } from "./useTablePicker";

export function TablePickerSearch<T extends string = string>({
  value,
  options,
  onValueChange,
  onSelect,
  onCommit,
  filterOption,
  placeholder = "Search…",
  autoFocus = false,
  icon,
  inputStyle,
  renderItem,
}: TablePickerSearchProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { anchor, measureAnchor } = useTablePicker(inputRef, open, setOpen, rootRef);

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) {
      return options;
    }
    return options.filter((option) =>
      filterOption
        ? filterOption(option, query)
        : option.label.toLowerCase().includes(query) ||
          option.value.toLowerCase().includes(query),
    );
  }, [filterOption, options, value]);

  const menuOpen = open && suggestions.length > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit?.();
      setOpen(false);
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <>
      <div
        ref={rootRef}
        data-mcp-row-interactive
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0 }}
      >
        {icon}
        <input
          ref={inputRef}
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            measureAnchor();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{ ...tablePickerSearchInputStyle, ...inputStyle }}
        />
      </div>
      <TablePickerPanel
        open={menuOpen}
        anchor={anchor}
        options={suggestions}
        selectedValue={value.trim() || null}
        onPick={(option) => {
          onSelect(option);
          setOpen(false);
        }}
        renderItem={renderItem}
      />
    </>
  );
}
