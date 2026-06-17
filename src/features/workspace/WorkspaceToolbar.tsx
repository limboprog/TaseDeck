import { MdOutlineJoinLeft } from "../../icons";
import { WorkspaceIconButton } from "./workspaceIconButton";

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
      <WorkspaceIconButton
        active={groupToolActive}
        onPress={onToggleGroupTool}
        aria-label={tooltip}
        aria-pressed={groupToolActive}
      >
        <MdOutlineJoinLeft size={18} />
      </WorkspaceIconButton>
    </div>
  );
}
