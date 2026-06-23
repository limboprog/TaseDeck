import { MdOutlineJoinLeft } from "../../icons";
import { ToolbarIconButton } from "../../components/pane";

type WorkspaceToolbarProps = {
  groupToolActive: boolean;
  onToggleGroupTool: () => void;
};

export function WorkspaceToolbar({ groupToolActive, onToggleGroupTool }: WorkspaceToolbarProps) {
  const tooltip = groupToolActive
    ? "Отменить группировку"
    : "Group — выделите область на холсте с MCP-серверами";

  return (
    <div title={tooltip}>
      <ToolbarIconButton
        active={groupToolActive}
        onClick={onToggleGroupTool}
        aria-label={tooltip}
        aria-pressed={groupToolActive}
      >
        <MdOutlineJoinLeft size={18} />
      </ToolbarIconButton>
    </div>
  );
}
