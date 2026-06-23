import { IoShieldOutline, MdOutlineEdit, VscSettings } from "../../icons";
import type { AgentRecord } from "../../services/agents/recordsApi";
import { AgentBrandLogo } from "../../services/agents/AgentBrandLogo";
import type { AgentPresetMode } from "../../services/projects/detailApi";
import { colors } from "../../theme";
import {
  PROJECT_AGENT_NODE_WIDTH,
  PROJECT_NODE_CONNECTOR_WIDTH,
  PROJECT_PRESET_NODE_WIDTH,
  PROJECT_ROW_WIDTH,
} from "./projectLayout";
import { ProjectSignificantNode } from "./ProjectSignificantNode";

type ProjectAgentPresetRowProps = {
  agent: AgentRecord;
  presetName: string | null;
  presetMode?: AgentPresetMode | null;
  agentRightRef?: (node: HTMLDivElement | null) => void;
  presetRef?: (node: HTMLDivElement | null) => void;
  presetAction?: React.ReactNode;
};

function PresetModeIndicator({ mode }: { mode: AgentPresetMode }) {
  const isDefault = mode === "default";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        color: colors.muted,
        fontSize: 11,
        fontWeight: 600,
        userSelect: "none",
      }}
    >
      {isDefault ? (
        <IoShieldOutline size={13} aria-hidden />
      ) : (
        <MdOutlineEdit size={13} aria-hidden />
      )}
      <span>{isDefault ? "default" : "custom"}</span>
    </span>
  );
}

export function ProjectAgentPresetRow({
  agent,
  presetName,
  presetMode,
  agentRightRef,
  presetRef,
  presetAction,
}: ProjectAgentPresetRowProps) {
  const showMode = presetMode != null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        width: PROJECT_ROW_WIDTH,
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      <div ref={agentRightRef} style={{ flexShrink: 0 }}>
        <ProjectSignificantNode
          label="Agent:"
          title={agent.name}
          width={PROJECT_AGENT_NODE_WIDTH}
          icon={<AgentBrandLogo kind={agent.kind} size={18} />}
        />
      </div>

      <div
        aria-hidden
        style={{
          width: PROJECT_NODE_CONNECTOR_WIDTH,
          height: 1,
          background: colors.treeRail,
          flexShrink: 0,
        }}
      />

      <div ref={presetRef} style={{ flexShrink: 0 }}>
        <ProjectSignificantNode
          label="Preset:"
          labelSuffix={showMode ? <PresetModeIndicator mode={presetMode} /> : undefined}
          title={presetName ?? "Not assigned"}
          width={PROJECT_PRESET_NODE_WIDTH}
          icon={<VscSettings size={16} color={colors.muted} aria-hidden />}
          action={presetAction}
        />
      </div>
    </div>
  );
}
