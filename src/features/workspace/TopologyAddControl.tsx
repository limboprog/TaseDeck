import { useMemo } from "react";
import type { AgentRecord } from "../../services/agents/recordsApi";
import type { InstalledMcpServer } from "../../services/mcp_installed";
import { PaneMenu, type PaneMenuGroup } from "../../components/pane";

type TopologyAddControlProps = {
  agents: AgentRecord[];
  mcps: InstalledMcpServer[];
  onPickAgent: (agent: AgentRecord) => void;
  onPickMcp: (server: InstalledMcpServer) => void;
  onMenuOpen?: () => void;
};

export function TopologyAddControl({
  agents,
  mcps,
  onPickAgent,
  onPickMcp,
  onMenuOpen,
}: TopologyAddControlProps) {
  const rows = useMemo<PaneMenuGroup[]>(
    () => [
      {
        type: "group",
        id: "agent",
        label: "Agent",
        emptyMessage: "Add an agent on the Agents tab first.",
        items: agents.map((agent) => ({
          key: String(agent.id),
          label: agent.name,
          onPick: () => onPickAgent(agent),
        })),
      },
      {
        type: "group",
        id: "mcp",
        label: "MCP",
        emptyMessage: "Install MCP from Market, then configure transport on the MCP tab.",
        items: mcps.map((server) => ({
          key: String(server.id),
          label: server.name,
          onPick: () => onPickMcp(server),
        })),
      },
    ],
    [agents, mcps, onPickAgent, onPickMcp],
  );

  return (
    <PaneMenu
      label="Add"
      rows={rows}
      minWidth={88}
      fontWeight={500}
      onOpen={onMenuOpen}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}
