import { useMemo } from "react";
import type { TablePickerOption } from "../../components/TablePicker";
import { PaneMenu, paneMenuItemsFromOptions, PaneToolbar, ToolbarChip } from "../../components/pane";

type UsageFilterBarProps = {
  callerOptions: TablePickerOption[];
  mcpOptions: TablePickerOption[];
  selectedCallers: string[];
  selectedMcps: string[];
  onAddCaller: (value: string) => void;
  onRemoveCaller: (value: string) => void;
  onAddMcp: (value: string) => void;
  onRemoveMcp: (value: string) => void;
};

export function UsageFilterBar({
  callerOptions,
  mcpOptions,
  selectedCallers,
  selectedMcps,
  onAddCaller,
  onRemoveCaller,
  onAddMcp,
  onRemoveMcp,
}: UsageFilterBarProps) {
  const availableCallers = useMemo(
    () =>
      callerOptions.filter(
        (option) =>
          !selectedCallers.some(
            (value) => value.toLowerCase() === option.value.toLowerCase(),
          ),
      ),
    [callerOptions, selectedCallers],
  );

  const availableMcps = useMemo(
    () =>
      mcpOptions.filter(
        (option) =>
          !selectedMcps.some(
            (value) => value.toLowerCase() === option.value.toLowerCase(),
          ),
      ),
    [mcpOptions, selectedMcps],
  );

  const callerChipLabels = useMemo(
    () =>
      new Map(
        callerOptions.map((option) => [option.value.toLowerCase(), option.label]),
      ),
    [callerOptions],
  );

  const mcpChipLabels = useMemo(
    () =>
      new Map(mcpOptions.map((option) => [option.value.toLowerCase(), option.label])),
    [mcpOptions],
  );

  const callerRows = useMemo(
    () => paneMenuItemsFromOptions(availableCallers, onAddCaller),
    [availableCallers, onAddCaller],
  );

  const mcpRows = useMemo(
    () => paneMenuItemsFromOptions(availableMcps, onAddMcp),
    [availableMcps, onAddMcp],
  );

  return (
    <PaneToolbar>
      <PaneMenu
        label="Caller"
        rows={callerRows}
        emptyMessage="No callers left"
        disabled={availableCallers.length === 0}
      />
      {selectedCallers.map((value) => (
        <ToolbarChip
          key={`caller-${value}`}
          label={callerChipLabels.get(value.toLowerCase()) ?? value}
          onRemove={() => onRemoveCaller(value)}
        />
      ))}

      <div style={{ width: 4, flexShrink: 0 }} aria-hidden />

      <PaneMenu
        label="MCP"
        rows={mcpRows}
        emptyMessage="No MCP servers left"
        disabled={availableMcps.length === 0}
      />
      {selectedMcps.map((value) => (
        <ToolbarChip
          key={`mcp-${value}`}
          label={mcpChipLabels.get(value.toLowerCase()) ?? value}
          onRemove={() => onRemoveMcp(value)}
        />
      ))}
    </PaneToolbar>
  );
}
