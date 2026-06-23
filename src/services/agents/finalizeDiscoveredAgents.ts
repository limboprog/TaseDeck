import {
  applyUseDefaultConfiguration,
  ensureAgentMcpSnapshot,
} from "./agentMcpSetup";
import { listAgentRecords } from "./recordsApi";
import { setUseDefaultConfiguration } from "./agentMcpSnapshot";

export async function finalizeDiscoveredAgents(agentIds: number[]) {
  if (agentIds.length === 0) {
    return;
  }

  const agents = await listAgentRecords();
  const byId = new Map(agents.map((agent) => [agent.id, agent]));

  for (const agentId of agentIds) {
    const agent = byId.get(agentId);
    if (!agent) {
      continue;
    }
    await ensureAgentMcpSnapshot(agent);
    setUseDefaultConfiguration(agent.id, true);
    await applyUseDefaultConfiguration(agent, true);
  }
}
