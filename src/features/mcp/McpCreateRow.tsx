import { PiLaptopLight } from "../../icons";
import { PaneCreateRow } from "../../components/pane/PaneCreateRow";
import { MCP_LIST_KIND_ICON_COLORS } from "./mcpListCardKind";

type McpCreateRowProps = {
  name: string;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onCommit: () => void;
};

export function McpCreateRow({
  name,
  onNameChange,
  onCancel,
  onCommit,
}: McpCreateRowProps) {
  return (
    <PaneCreateRow
      value={name}
      onChange={onNameChange}
      onCancel={onCancel}
      onCommit={onCommit}
      placeholder="Server name"
      leading={<PiLaptopLight size={18} color={MCP_LIST_KIND_ICON_COLORS.local} aria-hidden />}
    />
  );
}
