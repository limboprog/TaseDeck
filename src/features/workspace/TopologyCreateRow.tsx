import { IoPrism } from "../../icons";
import { PaneCreateRow } from "../../components/pane/PaneCreateRow";
import { colors } from "../../theme";

type TopologyCreateRowProps = {
  name: string;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onCommit: () => void;
};

export function TopologyCreateRow({
  name,
  onNameChange,
  onCancel,
  onCommit,
}: TopologyCreateRowProps) {
  return (
    <PaneCreateRow
      value={name}
      onChange={onNameChange}
      onCancel={onCancel}
      onCommit={onCommit}
      placeholder="Topology name"
      leading={<IoPrism size={16} color={colors.accent} aria-hidden />}
    />
  );
}
