import { useCallback, useEffect, useState } from "react";
import type { AgentKind, ConfiguredAgent } from "./types";
import { createConfiguredAgent, getStoredAgents, saveAgents } from "./storage";

export function useConfiguredAgents() {
  const [agents, setAgents] = useState<ConfiguredAgent[]>(() => getStoredAgents());

  useEffect(() => {
    saveAgents(agents);
  }, [agents]);

  const addAgent = useCallback((kind: AgentKind) => {
    setAgents((current) => {
      if (current.some((entry) => entry.kind === kind)) {
        return current;
      }
      return [...current, createConfiguredAgent(kind)];
    });
  }, []);

  const removeAgent = useCallback((id: string) => {
    setAgents((current) => current.filter((entry) => entry.id !== id));
  }, []);

  return { agents, addAgent, removeAgent };
}
