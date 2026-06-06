import { invoke } from "@tauri-apps/api/core";

import type { AgentKind } from "./types";

export type AgentRecord = {
  id: number;
  name: string;
  kind: AgentKind;
  configDirPath: string;
  createdAt: string;
  updatedAt: string;
};

export const AGENTS_CHANGED_EVENT = "agents-changed";

export function notifyAgentsChanged() {
  window.dispatchEvent(new CustomEvent(AGENTS_CHANGED_EVENT));
}

export function listAgentRecords() {
  return invoke<AgentRecord[]>("agent_record_list");
}

export async function createAgentRecord(
  agent: Pick<AgentRecord, "name" | "kind" | "configDirPath">,
) {
  const created = await invoke<AgentRecord>("agent_record_create", {
    agent: {
      id: 0,
      name: agent.name,
      kind: agent.kind,
      configDirPath: agent.configDirPath,
      createdAt: "",
      updatedAt: "",
    },
  });
  notifyAgentsChanged();
  return created;
}

export async function updateAgentRecord(agent: AgentRecord) {
  const updated = await invoke<AgentRecord>("agent_record_update", { agent });
  notifyAgentsChanged();
  return updated;
}

export async function deleteAgentRecord(id: number) {
  const deleted = await invoke<boolean>("agent_record_delete", { id });
  notifyAgentsChanged();
  return deleted;
}
