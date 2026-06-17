import { useEffect, useState } from "react";
import {
  getMcpTransportCatalogSync,
  loadMcpTransportCatalog,
  type McpTransportCatalogEntry,
} from "./mcpTransportCatalog";

export function useMcpTransportCatalog(): McpTransportCatalogEntry[] {
  const [catalog, setCatalog] = useState<McpTransportCatalogEntry[]>(() =>
    getMcpTransportCatalogSync(),
  );

  useEffect(() => {
    let active = true;
    void loadMcpTransportCatalog().then((entries) => {
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
