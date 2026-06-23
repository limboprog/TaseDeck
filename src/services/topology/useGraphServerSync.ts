import { useEffect, useRef } from "react";
import { getGraphState, saveGraphLinks } from "./graphApi";
import { applyServerLinksToTopology, buildLinkInputs } from "./graphState";
import type { TopologyBlock, TopologyEdge, TopologyNode } from "./types";

const SYNC_DELAY_MS = 600;

type GraphHydrate = {
  edges?: TopologyEdge[];
  blocks?: TopologyBlock[];
  nodes?: TopologyNode[];
};

type UseGraphServerSyncOptions = {
  clientId: string;
  name: string;
  nodes: TopologyNode[];
  blocks: TopologyBlock[];
  edges: TopologyEdge[];
  defaultAgentRecordId?: number;
  /** Called once on load when local graph has no edges yet. */
  onHydrate?: (patch: GraphHydrate) => void;
  onError?: (message: string) => void;
};

function blocksActiveStateEqual(a: TopologyBlock[], b: TopologyBlock[]) {
  return JSON.stringify(a.map((block) => block.memberRunning ?? {})) ===
    JSON.stringify(b.map((block) => block.memberRunning ?? {}));
}

function standaloneMcpActiveEqual(a: TopologyNode[], b: TopologyNode[]) {
  const pick = (nodes: TopologyNode[]) =>
    Object.fromEntries(
      nodes
        .filter((node) => node.type === "mcp" && !node.blockId)
        .map((node) => [node.id, node.mcpActive !== false]),
    );
  return JSON.stringify(pick(a)) === JSON.stringify(pick(b));
}

/**
 * Background sync: SQLite stores which MCP servers are linked to agents and active flags.
 * Layout and edges render from local topology state immediately.
 */
export function useGraphServerSync({
  clientId,
  name,
  nodes,
  blocks,
  edges,
  defaultAgentRecordId,
  onHydrate,
  onError,
}: UseGraphServerSyncOptions) {
  const nodesRef = useRef(nodes);
  const blocksRef = useRef(blocks);
  const edgesRef = useRef(edges);
  const defaultAgentRef = useRef(defaultAgentRecordId);
  const onHydrateRef = useRef(onHydrate);
  const onErrorRef = useRef(onError);
  const hydratedRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrateRequestRef = useRef(0);

  nodesRef.current = nodes;
  blocksRef.current = blocks;
  edgesRef.current = edges;
  defaultAgentRef.current = defaultAgentRecordId;
  onHydrateRef.current = onHydrate;
  onErrorRef.current = onError;

  useEffect(() => {
    const requestId = hydrateRequestRef.current + 1;
    hydrateRequestRef.current = requestId;
    hydratedRef.current = false;

    getGraphState(clientId, name)
      .then((state) => {
        if (requestId !== hydrateRequestRef.current) {
          return;
        }

        const merged = applyServerLinksToTopology(
          nodesRef.current,
          blocksRef.current,
          state.links,
          defaultAgentRef.current,
        );

        const localEdges = edgesRef.current;
        const patch: GraphHydrate = {};

        if (localEdges.length === 0 && merged.edges.length > 0) {
          patch.edges = merged.edges;
        }

        if (!blocksActiveStateEqual(blocksRef.current, merged.blocks)) {
          patch.blocks = merged.blocks;
        }

        if (!standaloneMcpActiveEqual(nodesRef.current, merged.nodes)) {
          patch.nodes = merged.nodes;
        }

        if (patch.edges || patch.blocks || patch.nodes) {
          onHydrateRef.current?.(patch);
        }

        hydratedRef.current = true;
      })
      .catch((reason: unknown) => {
        if (requestId !== hydrateRequestRef.current) {
          return;
        }
        const message = reason instanceof Error ? reason.message : String(reason);
        onErrorRef.current?.(message);
        hydratedRef.current = true;
      });

    return () => {
      hydrateRequestRef.current += 1;
    };
  }, [clientId, name]);

  useEffect(() => {
    if (!hydratedRef.current && edges.length === 0) {
      return;
    }

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = setTimeout(() => {
      const links = buildLinkInputs(
        nodesRef.current,
        blocksRef.current,
        edgesRef.current,
        defaultAgentRef.current,
      );
      void saveGraphLinks(clientId, name, links).catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        onErrorRef.current?.(message);
      });
    }, SYNC_DELAY_MS);

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, [blocks, clientId, edges, name, nodes]);

  const syncNow = () => {
    const links = buildLinkInputs(
      nodesRef.current,
      blocksRef.current,
      edgesRef.current,
      defaultAgentRef.current,
    );
    void saveGraphLinks(clientId, name, links).catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      onErrorRef.current?.(message);
    });
  };

  return { syncNow };
}
