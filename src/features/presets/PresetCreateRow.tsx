import { VscSettings } from "../../icons";
import { PaneCreateRow } from "../../components/pane/PaneCreateRow";
import { colors } from "../../theme";

type PresetCreateRowProps = {
  name: string;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onCommit: () => void;
};

export function PresetCreateRow({
  name,
  onNameChange,
  onCancel,
  onCommit,
}: PresetCreateRowProps) {
  return (
    <PaneCreateRow
      value={name}
      onChange={onNameChange}
      onCancel={onCancel}
      onCommit={onCommit}
      placeholder="Preset name"
      leading={<VscSettings size={16} color={colors.accent} aria-hidden />}
    />
  );
}
