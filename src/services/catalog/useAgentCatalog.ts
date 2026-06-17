import { useEffect, useState } from "react";
import type { AgentCatalogEntry } from "../agents/types";
import { getAgentCatalogSync, loadAgentCatalog } from "./agentCatalog";

export function useAgentCatalog(): AgentCatalogEntry[] {
  const [catalog, setCatalog] = useState<AgentCatalogEntry[]>(() => getAgentCatalogSync());

  useEffect(() => {
    let active = true;
    void loadAgentCatalog().then((entries) => {
      if (active) {
        setCatalog(entries);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return catalog;
}
