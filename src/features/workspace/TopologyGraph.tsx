import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { InlineLoader } from "../../components/InlineLoader";
import { Text, XStack, YStack } from "tamagui";
import { useInstalledMcpServers } from "../../services/mcp_installed";
import {
  MCP_INSTALLED_EVENT,
  MCP_REMOVED_EVENT,
} from "../../services/mcp_installed/types";
import {
  AGENTS_CHANGED_EVENT,
  listAgentRecords,
  type AgentRecord,
} from "../../services/agents/recordsApi";
import { listGraphPlaceableMcpIds } from "../../services/topology/graphApi";
import {
  createId,
  type Topology,
  type TopologyBlock,
  type TopologyEdge,
  type TopologyNode,
  type TopologyNodeType,
} from "../../services/topology";
import { useGraphServerSync } from "../../services/topology/useGraphServerSync";
import { blocks as themeBlocks, colors, graph } from "../../theme";
import { TopologyAddControl } from "./TopologyAddControl";
import {
  collectMcpsFromSelectionRect,
  getBlockRect,
  getBlockWidth,
  getMemberRowRect,
  mergeMcpsIntoSingleBlock,
  moveBlock,
  normalizeRect,
} from "./blockLayout";
import { edgeStrokeColor, GraphEdgeControl } from "./GraphEdgeControl";
import { GraphBlock } from "./GraphBlock";
import { getNodeHeight, GraphNode } from "./GraphNode";
import {
  applyBlockEdgeEnabled,
  applyStandaloneMcpEdgeEnabled,
  isBlockConfigured,
  isMcpNodeActive,
  isNodeGraphReady,
  isValidConnection,
  normalizeEdgeEndpoints,
} from "./graphConnections";
import {
  buildEdgePath,
  getCanvasPoint,
  getCubicMidpoint,
  getCubicTangentAngle,
  getEdgeAnchorsForEndpoints,
  getWireAnchorsForSource,
  hitTestWireTarget,
  type Point,
} from "./graphGeometry";
import { PickNodeModal } from "./PickNodeModal";
import {
  computeFitViewport,
  loadTopologyViewport,
  saveTopologyViewport,
} from "../../services/topology/topologyViewport";
import { WorkspaceToolbar } from "./WorkspaceToolbar";

type TopologyGraphProps = {
  topology: Topology;
  workspaceActive?: boolean;
  onTopologyChange: (patch: Partial<Pick<Topology, "nodes" | "blocks" | "edges">>) => void;
  onOpenMcpPanel?: (mcpServerId: number) => void;
};

type WireDraft = {
  sourceId: string;
  cursor: Point;
  hoverTargetId: string | null;
};

type PendingPointer = {
  nodeId?: string;
  blockId?: string;
  startX: number;
  startY: number;
};

type PanSession = {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const DRAG_THRESHOLD = 6;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;
const ZOOM_WHEEL_INTENSITY = 0.008;
function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function wheelZoomFactor(deltaY: number) {
  return Math.exp(-deltaY * ZOOM_WHEEL_INTENSITY);
}

function defaultPosition(index: number) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  return { x: 80 + column * 220, y: 80 + row * 120 };
}

export function TopologyGraph({
  topology,
  workspaceActive = true,
  onTopologyChange,
  onOpenMcpPanel,
}: TopologyGraphProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(
    null,
  );
  const blockDragRef = useRef<{ blockId: string; offsetX: number; offsetY: number } | null>(
    null,
  );
  const pendingRef = useRef<PendingPointer | null>(null);
  const panSessionRef = useRef<PanSession | null>(null);
  const movedRef = useRef(false);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(1);

  const [pickModalType, setPickModalType] = useState<TopologyNodeType | null>(null);
  const [groupToolActive, setGroupToolActive] = useState(false);
  const [marquee, setMarquee] = useState<{ start: Point; end: Point } | null>(null);
  const marqueeRef = useRef<{ start: Point; end: Point } | null>(null);
  const [wireDraft, setWireDraft] = useState<WireDraft | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [foregroundBlockId, setForegroundBlockId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const { servers: installedMcps } = useInstalledMcpServers();
  const [agentRecords, setAgentRecords] = useState<AgentRecord[]>([]);
  const [placeableMcpIds, setPlaceableMcpIds] = useState<number[]>([]);
  const [placeableLoading, setPlaceableLoading] = useState(true);

  const placeableAgentIdSet = useMemo(
    () => new Set(agentRecords.map((agent) => agent.id)),
    [agentRecords],
  );
  const placeableMcpIdSet = useMemo(() => new Set(placeableMcpIds), [placeableMcpIds]);

  const graphPlaceableMcps = useMemo(
    () => installedMcps.filter((server) => placeableMcpIdSet.has(server.id)),
    [installedMcps, placeableMcpIdSet],
  );

  const refreshPlaceableNodes = useCallback(() => {
    setPlaceableLoading(true);
    void Promise.all([listAgentRecords(), listGraphPlaceableMcpIds()])
      .then(([agents, mcpIds]) => {
        setAgentRecords(agents);
        setPlaceableMcpIds(mcpIds);
      })
      .catch(() => {
        setAgentRecords([]);
        setPlaceableMcpIds([]);
      })
      .finally(() => setPlaceableLoading(false));
  }, []);

  useEffect(() => {
    if (!workspaceActive) {
      return;
    }
    refreshPlaceableNodes();
  }, [workspaceActive, refreshPlaceableNodes, topology.id]);

  useEffect(() => {
    if (pickModalType === "agent") {
      refreshPlaceableNodes();
    }
  }, [pickModalType, refreshPlaceableNodes]);

  useEffect(() => {
    const onAgentsChanged = () => refreshPlaceableNodes();
    window.addEventListener(AGENTS_CHANGED_EVENT, onAgentsChanged);
    return () => window.removeEventListener(AGENTS_CHANGED_EVENT, onAgentsChanged);
  }, [refreshPlaceableNodes]);

  useEffect(() => {
    const onMcpChanged = () => refreshPlaceableNodes();
    window.addEventListener(MCP_INSTALLED_EVENT, onMcpChanged);
    window.addEventListener(MCP_REMOVED_EVENT, onMcpChanged);
    return () => {
      window.removeEventListener(MCP_INSTALLED_EVENT, onMcpChanged);
      window.removeEventListener(MCP_REMOVED_EVENT, onMcpChanged);
    };
  }, [refreshPlaceableNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const width = canvas?.clientWidth ?? 800;
    const height = canvas?.clientHeight ?? 600;
    const saved = loadTopologyViewport(topology.id);
    const viewport =
      saved ??
      computeFitViewport(topology.nodes, topology.blocks ?? [], width, height);
    panRef.current = viewport.pan;
    zoomRef.current = viewport.zoom;
    setPan(viewport.pan);
    setZoom(viewport.zoom);
  }, [topology.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveTopologyViewport(topology.id, { pan, zoom });
    }, 320);
    return () => {
      window.clearTimeout(timer);
      saveTopologyViewport(topology.id, {
        pan: panRef.current,
        zoom: zoomRef.current,
      });
    };
  }, [topology.id, pan.x, pan.y, zoom]);

  const blocks = topology.blocks ?? [];
  const edges = topology.edges ?? [];

  const defaultAgentRecordId = agentRecords[0]?.id;
  const [, setGraphSyncError] = useState<string | null>(null);

  const { syncNow: syncGraphNow, hydrating: graphHydrating } = useGraphServerSync({
    clientId: topology.id,
    name: topology.name,
    nodes: topology.nodes,
    blocks,
    edges,
    defaultAgentRecordId,
    onHydrate: (patch) => onTopologyChange(patch),
    onError: setGraphSyncError,
  });

  const [layoutOverride, setLayoutOverride] = useState<{
    nodes?: TopologyNode[];
    blocks?: TopologyBlock[];
  } | null>(null);

  const displayNodes = layoutOverride?.nodes ?? topology.nodes;
  const displayBlocks = layoutOverride?.blocks ?? blocks;

  const nodeById = useMemo(
    () => new Map(displayNodes.map((node) => [node.id, node])),
    [displayNodes],
  );

  const blocksById = useMemo(
    () => new Map(displayBlocks.map((block) => [block.id, block])),
    [displayBlocks],
  );

  panRef.current = pan;
  zoomRef.current = zoom;

  const linkedMcpNamesByAgent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of edges) {
      if (edge.enabled === false) {
        continue;
      }
      const target = nodeById.get(edge.targetId);
      if (!target || target.type !== "agent") {
        continue;
      }

      const block = blocksById.get(edge.sourceId);
      if (block) {
        const current = map.get(target.id) ?? [];
        current.push(block.name);
        map.set(target.id, current);
        continue;
      }

      const source = nodeById.get(edge.sourceId);
      if (!source || source.type !== "mcp" || source.blockId) {
        continue;
      }
      const current = map.get(target.id) ?? [];
      current.push(source.name);
      map.set(target.id, current);
    }
    return map;
  }, [blocksById, edges, nodeById]);

  const linkedCountByNode = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of topology.nodes) {
      map.set(node.id, linkedMcpNamesByAgent.get(node.id)?.length ?? 0);
    }
    return map;
  }, [topology.nodes, linkedMcpNamesByAgent]);

  const updateNodes = useCallback(
    (nodes: TopologyNode[]) => onTopologyChange({ nodes }),
    [onTopologyChange],
  );

  const updateBlocks = useCallback(
    (nextBlocks: TopologyBlock[]) => onTopologyChange({ blocks: nextBlocks }),
    [onTopologyChange],
  );

  const updateEdges = useCallback(
    (updater: TopologyEdge[] | ((current: TopologyEdge[]) => TopologyEdge[])) => {
      onTopologyChange({
        edges: typeof updater === "function" ? updater(topology.edges ?? []) : updater,
      });
    },
    [onTopologyChange, topology.edges],
  );

  const commitLayoutOverride = useCallback(() => {
    setLayoutOverride((current) => {
      if (current?.nodes) {
        onTopologyChange({ nodes: current.nodes });
      }
      if (current?.blocks) {
        onTopologyChange({ blocks: current.blocks });
      }
      return null;
    });
  }, [onTopologyChange]);

  useEffect(() => {
    if (defaultAgentRecordId === undefined || !placeableAgentIdSet.has(defaultAgentRecordId)) {
      return;
    }
    const needsPatch = topology.nodes.some(
      (node) => node.type === "agent" && node.agentRecordId === undefined,
    );
    if (!needsPatch) {
      return;
    }
    updateNodes(
      topology.nodes.map((node) =>
        node.type === "agent" && node.agentRecordId === undefined
          ? { ...node, agentRecordId: defaultAgentRecordId }
          : node,
      ),
    );
  }, [defaultAgentRecordId, placeableAgentIdSet, topology.nodes, updateNodes]);

  const addNode = useCallback(
    (node: TopologyNode) => {
      updateNodes([...topology.nodes, node]);
    },
    [topology.nodes, updateNodes],
  );

  useEffect(() => {
    if (!draggingNodeId && !draggingBlockId && !isPanning) {
      return undefined;
    }

    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = previousUserSelect;
    };
  }, [draggingBlockId, draggingNodeId, isPanning]);

  const zoomAtScreenPoint = useCallback((screenX: number, screenY: number, factor: number) => {
    const currentPan = panRef.current;
    const currentZoom = zoomRef.current;
    const nextZoom = clampZoom(currentZoom * factor);
    const worldX = (screenX - currentPan.x) / currentZoom;
    const worldY = (screenY - currentPan.y) / currentZoom;
    const nextPan = {
      x: screenX - worldX * nextZoom,
      y: screenY - worldY * nextZoom,
    };
    panRef.current = nextPan;
    zoomRef.current = nextZoom;
    setPan(nextPan);
    setZoom(nextZoom);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAtScreenPoint(
        event.clientX - rect.left,
        event.clientY - rect.top,
        wheelZoomFactor(event.deltaY),
      );
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAtScreenPoint]);

  const handlePickNodeType = (type: TopologyNodeType) => {
    setPickModalType(type);
  };

  const finishPickAgent = (agent: AgentRecord) => {
    const index = topology.nodes.length;
    const position = defaultPosition(index);
    addNode({
      id: createId(),
      type: "agent",
      name: agent.name,
      agentKind: agent.kind,
      agentRecordId: agent.id,
      x: position.x,
      y: position.y,
      expanded: false,
    });
    setPickModalType(null);
  };

  const finishPickMcp = (server: (typeof installedMcps)[number]) => {
    if (!placeableMcpIdSet.has(server.id)) {
      return;
    }

    const index = topology.nodes.length;
    const position = defaultPosition(index);
    addNode({
      id: createId(),
      type: "mcp",
      name: server.name,
      mcpServerId: server.id,
      x: position.x,
      y: position.y,
      expanded: false,
    });
    setPickModalType(null);
  };

  const finalizeMarquee = useCallback(
    (end: Point) => {
      const start = marqueeRef.current?.start;
      marqueeRef.current = null;
      setMarquee(null);

      if (!start) {
        return;
      }

      const selection = normalizeRect(start, end);
      if (selection.width < 4 || selection.height < 4) {
        return;
      }

      const mcpIds = collectMcpsFromSelectionRect(selection, blocks, topology.nodes);
      const result = mergeMcpsIntoSingleBlock(
        mcpIds,
        blocks,
        topology.nodes,
        edges,
        placeableAgentIdSet,
        placeableMcpIdSet,
      );
      if (result) {
        updateBlocks(result.blocks);
        updateNodes(result.nodes);
        updateEdges(result.edges);
      }
    },
    [
      blocks,
      edges,
      placeableAgentIdSet,
      placeableMcpIdSet,
      topology.nodes,
      updateBlocks,
      updateEdges,
      updateNodes,
    ],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      if (marqueeRef.current) {
        const point = getCanvasPoint(event, canvas, pan, zoom);
        marqueeRef.current.end = point;
        setMarquee({ start: marqueeRef.current.start, end: point });
        return;
      }

      if (panSessionRef.current) {
        const session = panSessionRef.current;
        setPan({
          x: session.originX + (event.clientX - session.startX),
          y: session.originY + (event.clientY - session.startY),
        });
        return;
      }

      const point = getCanvasPoint(event, canvas, pan, zoom);

      if (blockDragRef.current) {
        const drag = blockDragRef.current;
        const block = blocksById.get(drag.blockId);
        if (block) {
          const nextX = point.x - drag.offsetX;
          const nextY = point.y - drag.offsetY;
          const moved = moveBlock(block, displayNodes, nextX, nextY);
          setLayoutOverride({
            nodes: moved.nodes,
            blocks: displayBlocks.map((entry) =>
              entry.id === block.id ? moved.block : entry,
            ),
          });
        }
        return;
      }

      if (dragRef.current) {
        const drag = dragRef.current;
        setLayoutOverride((current) => ({
          nodes: (current?.nodes ?? topology.nodes).map((node) =>
            node.id === drag.nodeId
              ? {
                  ...node,
                  x: point.x - drag.offsetX,
                  y: point.y - drag.offsetY,
                }
              : node,
          ),
          blocks: current?.blocks,
        }));
        return;
      }

      if (pendingRef.current) {
        const pending = pendingRef.current;
        const distance = Math.hypot(point.x - pending.startX, point.y - pending.startY);
        if (distance >= DRAG_THRESHOLD) {
          movedRef.current = true;
          if (pending.blockId) {
            const block = blocksById.get(pending.blockId);
            if (block) {
              blockDragRef.current = {
                blockId: pending.blockId,
                offsetX: pending.startX - block.x,
                offsetY: pending.startY - block.y,
              };
              setDraggingBlockId(pending.blockId);
              pendingRef.current = null;
              setWireDraft(null);
            }
          } else if (pending.nodeId) {
            const node = nodeById.get(pending.nodeId);
            if (node) {
              dragRef.current = {
                nodeId: pending.nodeId,
                offsetX: pending.startX - node.x,
                offsetY: pending.startY - node.y,
              };
              setDraggingNodeId(pending.nodeId);
              pendingRef.current = null;
              setWireDraft(null);
            }
          }
        }
        return;
      }

      if (wireDraft) {
        const hoverTargetId = hitTestWireTarget(
          displayNodes,
          displayBlocks,
          point,
          linkedCountByNode,
          wireDraft.sourceId,
        );
        const validHover =
          hoverTargetId &&
          isValidConnection(
            wireDraft.sourceId,
            hoverTargetId,
            nodeById,
            blocksById,
            placeableAgentIdSet,
            placeableMcpIdSet,
          )
            ? hoverTargetId
            : null;

        setWireDraft((current) =>
          current
            ? {
                ...current,
                cursor: point,
                hoverTargetId: validHover,
              }
            : null,
        );
      }
    },
    [
      displayBlocks,
      displayNodes,
      blocksById,
      linkedCountByNode,
      nodeById,
      pan,
      topology.nodes,
      wireDraft,
      zoom,
    ],
  );

  const finalizeWire = useCallback(
    (targetId: string) => {
      if (!wireDraft) {
        return;
      }

      const endpoints = normalizeEdgeEndpoints(
        wireDraft.sourceId,
        targetId,
        nodeById,
        blocksById,
        placeableAgentIdSet,
        placeableMcpIdSet,
      );
      if (!endpoints) {
        setWireDraft(null);
        return;
      }

      updateEdges((current) => {
        const exists = current.some(
          (edge) =>
            edge.sourceId === endpoints.sourceId &&
            edge.targetId === endpoints.targetId,
        );
        if (exists) {
          return current;
        }
        return [
          ...current,
          {
            id: createId(),
            sourceId: endpoints.sourceId,
            targetId: endpoints.targetId,
            enabled: true,
          },
        ];
      });
      setWireDraft(null);
    },
    [blocksById, nodeById, updateEdges, wireDraft],
  );

  const stopGlobalTracking = useCallback(
    (upHandler: (event: PointerEvent) => void) => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", upHandler);
    },
    [handlePointerMove],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      if (marqueeRef.current) {
        const point = getCanvasPoint(event, canvas, pan, zoom);
        finalizeMarquee(point);
        setGroupToolActive(false);
        stopGlobalTracking(handlePointerUp);
        return;
      }

      if (panSessionRef.current) {
        panSessionRef.current = null;
        setIsPanning(false);
        stopGlobalTracking(handlePointerUp);
        return;
      }

      const point = getCanvasPoint(event, canvas, pan, zoom);
      const hitId = hitTestWireTarget(
        displayNodes,
        displayBlocks,
        point,
        linkedCountByNode,
        dragRef.current?.nodeId ?? blockDragRef.current?.blockId,
      );

      if (blockDragRef.current) {
        commitLayoutOverride();
        blockDragRef.current = null;
        setDraggingBlockId(null);
        movedRef.current = false;
        pendingRef.current = null;
        stopGlobalTracking(handlePointerUp);
        return;
      }

      if (dragRef.current) {
        commitLayoutOverride();
        dragRef.current = null;
        setDraggingNodeId(null);
        movedRef.current = false;
        pendingRef.current = null;
        stopGlobalTracking(handlePointerUp);
        return;
      }

      if (wireDraft) {
        if (hitId && isValidConnection(
          wireDraft.sourceId,
          hitId,
          nodeById,
          blocksById,
          placeableAgentIdSet,
          placeableMcpIdSet,
        )) {
          finalizeWire(hitId);
        } else {
          setWireDraft(null);
        }
        movedRef.current = false;
        pendingRef.current = null;
        stopGlobalTracking(handlePointerUp);
        return;
      }

      if (pendingRef.current && !movedRef.current && pendingRef.current.blockId) {
        const block = blocksById.get(pendingRef.current.blockId);
        if (block && isBlockConfigured(block, nodeById, placeableMcpIdSet)) {
          setWireDraft({
            sourceId: pendingRef.current.blockId,
            cursor: point,
            hoverTargetId: null,
          });
        }
      } else if (pendingRef.current && !movedRef.current && pendingRef.current.nodeId) {
        const sourceNode = nodeById.get(pendingRef.current.nodeId);
        if (
          sourceNode &&
          isNodeGraphReady(sourceNode, placeableAgentIdSet, placeableMcpIdSet)
        ) {
          setWireDraft({
            sourceId: pendingRef.current.nodeId,
            cursor: point,
            hoverTargetId: null,
          });
        }
      }

      movedRef.current = false;
      pendingRef.current = null;
      stopGlobalTracking(handlePointerUp);
    },
    [
      commitLayoutOverride,
      finalizeMarquee,
      finalizeWire,
      blocksById,
      displayBlocks,
      displayNodes,
      linkedCountByNode,
      nodeById,
      pan,
      stopGlobalTracking,
      wireDraft,
      zoom,
    ],
  );

  const startGlobalTracking = useCallback(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [handlePointerMove, handlePointerUp]);

  useEffect(() => {
    if (!wireDraft) {
      return undefined;
    }

    const handleWireMove = (event: PointerEvent) => handlePointerMove(event);

    window.addEventListener("pointermove", handleWireMove);
    return () => {
      window.removeEventListener("pointermove", handleWireMove);
    };
  }, [handlePointerMove, wireDraft]);

  const handleNodePointerDown = (
    nodeId: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0 || draggingNodeId || draggingBlockId) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    event.stopPropagation();
    const node = nodeById.get(nodeId);
    if (!node) {
      return;
    }

    if (groupToolActive) {
      return;
    }

    const point = getCanvasPoint(event.nativeEvent, canvas, pan, zoom);

    if (wireDraft) {
      if (
        isValidConnection(
        wireDraft.sourceId,
        nodeId,
        nodeById,
        blocksById,
        placeableAgentIdSet,
        placeableMcpIdSet,
      ) &&
        nodeId !== wireDraft.sourceId
      ) {
        finalizeWire(nodeId);
      } else {
        setWireDraft(null);
      }
      return;
    }

    if (node.blockId) {
      return;
    }

    movedRef.current = false;
    pendingRef.current = {
      nodeId,
      startX: point.x,
      startY: point.y,
    };
    startGlobalTracking();
  };

  const handleBlockPointerDown = (
    blockId: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0 || draggingNodeId || draggingBlockId || groupToolActive) {
      return;
    }

    const canvas = canvasRef.current;
    const block = blocksById.get(blockId);
    if (!canvas || !block) {
      return;
    }

    if (!block.collapsed) {
      setForegroundBlockId(blockId);
    }

    event.stopPropagation();
    const point = getCanvasPoint(event.nativeEvent, canvas, pan, zoom);

    if (wireDraft) {
      if (
        isValidConnection(
        wireDraft.sourceId,
        blockId,
        nodeById,
        blocksById,
        placeableAgentIdSet,
        placeableMcpIdSet,
      ) &&
        blockId !== wireDraft.sourceId
      ) {
        finalizeWire(blockId);
      } else {
        setWireDraft(null);
      }
      return;
    }

    movedRef.current = false;
    pendingRef.current = {
      blockId,
      startX: point.x,
      startY: point.y,
    };
    startGlobalTracking();
  };

  const handleMemberPointerDown = (
    nodeId: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const node = nodeById.get(nodeId);
    if (!node?.blockId) {
      return;
    }

    handleBlockPointerDown(node.blockId, event);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || draggingNodeId || draggingBlockId) {
      return;
    }

    if (wireDraft) {
      setWireDraft(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (groupToolActive) {
      const point = getCanvasPoint(event.nativeEvent, canvas, pan, zoom);
      marqueeRef.current = { start: point, end: point };
      setMarquee({ start: point, end: point });
      startGlobalTracking();
      return;
    }

    panSessionRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    setIsPanning(true);
    startGlobalTracking();
  };

  const handleToggleExpand = (nodeId: string) => {
    updateNodes(
      topology.nodes.map((node) =>
        node.id === nodeId ? { ...node, expanded: !node.expanded } : node,
      ),
    );
  };

  const handleDeleteNode = (nodeId: string) => {
    updateNodes(topology.nodes.filter((entry) => entry.id !== nodeId));
    updateBlocks(
      blocks
        .map((block) => ({
          ...block,
          memberIds: block.memberIds.filter((memberId) => memberId !== nodeId),
        }))
        .filter((block) => block.memberIds.length > 0),
    );
    updateEdges((current) =>
      current.filter((edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId),
    );
    if (wireDraft?.sourceId === nodeId) {
      setWireDraft(null);
    }
  };

  const handleRenameBlock = (blockId: string, name: string) => {
    updateBlocks(
      blocks.map((block) => (block.id === blockId ? { ...block, name } : block)),
    );
  };

  const handleToggleBlockCollapsed = (blockId: string) => {
    const block = blocksById.get(blockId);
    const willExpand = Boolean(block?.collapsed);

    updateBlocks(
      blocks.map((entry) =>
        entry.id === blockId ? { ...entry, collapsed: !entry.collapsed } : entry,
      ),
    );

    if (willExpand) {
      setForegroundBlockId(blockId);
    } else if (foregroundBlockId === blockId) {
      setForegroundBlockId(null);
    }
  };

  const getBlockZIndex = (blockId: string, collapsed: boolean) => {
    if (draggingBlockId === blockId) {
      return 100;
    }
    if (!collapsed) {
      return foregroundBlockId === blockId ? 50 : 45;
    }
    return 2;
  };

  const handleToggleMemberRunning = (blockId: string, memberId: string) => {
    updateBlocks(
      blocks.map((block) => {
        if (block.id !== blockId) {
          return block;
        }
        const current = block.memberRunning?.[memberId] !== false;
        return {
          ...block,
          memberRunning: {
            ...block.memberRunning,
            [memberId]: !current,
          },
        };
      }),
    );
    syncGraphNow();
  };

  const handleOpenMcpPanel = (mcpServerId: number) => {
    onOpenMcpPanel?.(mcpServerId);
  };

  const handleDisconnectMember = (blockId: string, memberId: string) => {
    const block = blocksById.get(blockId);
    const node = nodeById.get(memberId);
    if (!block || !node) {
      return;
    }

    const memberIndex = block.memberIds.indexOf(memberId);
    const rowY =
      memberIndex >= 0
        ? getMemberRowRect(block, memberIndex).y
        : block.y + 48;

    const nextBlocks = blocks
      .map((entry) =>
        entry.id === blockId
          ? { ...entry, memberIds: entry.memberIds.filter((id) => id !== memberId) }
          : entry,
      )
      .filter((entry) => entry.memberIds.length > 0);

    const removedBlockIds = blocks
      .filter((entry) => entry.id === blockId && !nextBlocks.some((next) => next.id === entry.id))
      .map((entry) => entry.id);

    updateBlocks(nextBlocks);
    if (removedBlockIds.length > 0) {
      updateEdges((current) =>
        current.filter((edge) => !removedBlockIds.includes(edge.sourceId)),
      );
    }
    const memberWasActive = block.memberRunning?.[memberId] !== false;

    updateNodes(
      topology.nodes.map((entry) =>
        entry.id === memberId
          ? {
              ...entry,
              blockId: undefined,
              mcpActive: memberWasActive,
              mcpActiveSnapshot: undefined,
              x: block.x + getBlockWidth() + 28,
              y: rowY,
              expanded: false,
            }
          : entry,
      ),
    );
  };

  const handleToggleEdge = (edgeId: string) => {
    const edge = edges.find((entry) => entry.id === edgeId);
    if (!edge) {
      return;
    }

    const nextEnabled = edge.enabled === false;
    if (blocksById.has(edge.sourceId)) {
      updateBlocks(applyBlockEdgeEnabled(blocks, edge.sourceId, nextEnabled));
    } else {
      const source = nodeById.get(edge.sourceId);
      if (source?.type === "mcp" && !source.blockId) {
        updateNodes(applyStandaloneMcpEdgeEnabled(topology.nodes, source.id, nextEnabled));
      }
    }

    updateEdges((current) =>
      current.map((entry) =>
        entry.id === edgeId ? { ...entry, enabled: nextEnabled } : entry,
      ),
    );
    syncGraphNow();
  };

  const canvasSize = useMemo(() => {
    let width = 960;
    let height = 640;

    for (const node of displayNodes) {
      if (node.blockId) {
        continue;
      }
      const linkedCount = linkedCountByNode.get(node.id) ?? 0;
      width = Math.max(width, node.x + 240);
      height = Math.max(height, node.y + getNodeHeight(node, linkedCount) + 120);
    }

    for (const block of displayBlocks) {
      const rect = getBlockRect(block, block.memberIds.length);
      width = Math.max(width, rect.x + rect.width + 120);
      height = Math.max(height, rect.y + rect.height + 120);
    }

    return { width, height };
  }, [displayBlocks, displayNodes, linkedCountByNode]);

  const renderedEdges = useMemo(
    () =>
      edges
        .map((edge) => {
          const target = nodeById.get(edge.targetId);
          if (!target || target.type !== "agent") {
            return null;
          }

          const anchors = getEdgeAnchorsForEndpoints(
            edge.sourceId,
            target,
            displayNodes,
            blocksById,
          );
          if (!anchors) {
            return null;
          }

          return {
            edge,
            d: buildEdgePath(anchors),
            midpoint: getCubicMidpoint(anchors),
            tangentAngle: getCubicTangentAngle(anchors),
            enabled: edge.enabled !== false,
          };
        })
        .filter(Boolean) as Array<{
        edge: TopologyEdge;
        d: string;
        midpoint: Point;
        tangentAngle: number;
        enabled: boolean;
      }>,
    [blocksById, displayNodes, edges, nodeById],
  );

  const previewPath = useMemo(() => {
    if (!wireDraft) {
      return null;
    }

    if (wireDraft.hoverTargetId) {
      const target = nodeById.get(wireDraft.hoverTargetId);
      if (!target) {
        return null;
      }

      const endpoints = normalizeEdgeEndpoints(
        wireDraft.sourceId,
        wireDraft.hoverTargetId,
        nodeById,
        blocksById,
        placeableAgentIdSet,
        placeableMcpIdSet,
      );
      if (!endpoints) {
        return null;
      }

      const agentNode = nodeById.get(endpoints.targetId);
      if (!agentNode) {
        return null;
      }

      const anchors = getEdgeAnchorsForEndpoints(
        endpoints.sourceId,
        agentNode,
        displayNodes,
        blocksById,
      );
      return anchors ? buildEdgePath(anchors) : null;
    }

    const anchors = getWireAnchorsForSource(
      wireDraft.sourceId,
      wireDraft.cursor,
      displayNodes,
      blocksById,
    );
    return anchors ? buildEdgePath(anchors) : null;
  }, [
    blocksById,
    displayNodes,
    nodeById,
    placeableAgentIdSet,
    placeableMcpIdSet,
    wireDraft,
  ]);

  const canvasCursor =
    draggingNodeId || draggingBlockId
      ? "grabbing"
      : isPanning
        ? "grabbing"
        : groupToolActive || wireDraft
          ? "crosshair"
          : "grab";

  const interactionPassthrough = groupToolActive || marquee !== null;

  const dotGridPatternId = `topology-dot-grid-${topology.id}`;
  const dotGridStep = themeBlocks.graphDotGridStep;
  const dotGridWorldSpan = 24000;
  const dotGridWorldOrigin = -dotGridWorldSpan / 2;
  const graphLoading = placeableLoading || graphHydrating;

  return (
    <YStack flex={1} minH={0} minW={0} overflow="hidden" bg={colors.page} position="relative">
      <XStack
        gap={8}
        items="flex-start"
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 20,
          pointerEvents: "none",
          alignItems: "flex-start",
        }}
      >
        <div style={{ pointerEvents: "auto", flexShrink: 0, alignSelf: "flex-start" }}>
          <WorkspaceToolbar
            groupToolActive={groupToolActive}
            onToggleGroupTool={() => {
              setGroupToolActive((active) => !active);
              setMarquee(null);
              marqueeRef.current = null;
            }}
          />
        </div>

        <div style={{ pointerEvents: "auto", flexShrink: 0, alignSelf: "flex-start" }}>
          <TopologyAddControl onPickType={handlePickNodeType} />
        </div>
      </XStack>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
        }}
      >
          {pickModalType ? (
            <PickNodeModal
              type={pickModalType}
              installedMcps={graphPlaceableMcps}
              agentRecords={agentRecords}
              onPickAgent={finishPickAgent}
              onPickMcp={finishPickMcp}
              onClose={() => setPickModalType(null)}
            />
          ) : null}

          <div
            ref={canvasRef}
            className="topology-canvas"
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              cursor: canvasCursor,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            onPointerDown={handleCanvasPointerDown}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: canvasSize.width,
                height: canvasSize.height,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
              <svg
                aria-hidden
                style={{
                  position: "absolute",
                  left: dotGridWorldOrigin,
                  top: dotGridWorldOrigin,
                  width: dotGridWorldSpan,
                  height: dotGridWorldSpan,
                  pointerEvents: "none",
                  overflow: "visible",
                }}
              >
                <defs>
                  <pattern
                    id={dotGridPatternId}
                    width={dotGridStep}
                    height={dotGridStep}
                    patternUnits="userSpaceOnUse"
                  >
                    <circle
                      cx={dotGridStep / 2}
                      cy={dotGridStep / 2}
                      r={1.75}
                      fill={graph.gridDot}
                    />
                  </pattern>
                </defs>
                <rect
                  x={0}
                  y={0}
                  width={dotGridWorldSpan}
                  height={dotGridWorldSpan}
                  fill={`url(#${dotGridPatternId})`}
                />
              </svg>
              <svg
                style={{
                  position: "absolute",
                  inset: 0,
                  width: canvasSize.width,
                  height: canvasSize.height,
                  pointerEvents: "none",
                  overflow: "visible",
                }}
              >
                {renderedEdges.map(({ edge, d, enabled }) => (
                  <path
                    key={edge.id}
                    d={d}
                    fill="none"
                    stroke={edgeStrokeColor(enabled)}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                ))}
                {previewPath ? (
                  <path
                    d={previewPath}
                    fill="none"
                    stroke={graph.wirePreview}
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                  />
                ) : null}
              </svg>

              {marquee ? (
                <div
                  style={{
                    position: "absolute",
                    left: Math.min(marquee.start.x, marquee.end.x),
                    top: Math.min(marquee.start.y, marquee.end.y),
                    width: Math.abs(marquee.end.x - marquee.start.x),
                    height: Math.abs(marquee.end.y - marquee.start.y),
                    border: `1px dashed ${colors.accent}`,
                    background: graph.marqueeFill,
                    pointerEvents: "none",
                    zIndex: 200,
                  }}
                />
              ) : null}

              {displayBlocks.map((block) => {
                const members = block.memberIds
                  .map((memberId) => nodeById.get(memberId))
                  .filter((node): node is TopologyNode => Boolean(node));
                return (
                  <GraphBlock
                    key={block.id}
                    block={block}
                    members={members}
                    zIndex={getBlockZIndex(block.id, Boolean(block.collapsed))}
                    isWireSource={wireDraft?.sourceId === block.id}
                    isHoverTarget={wireDraft?.hoverTargetId === block.id}
                    isDragging={draggingBlockId === block.id}
                    pointerPassthrough={interactionPassthrough}
                    interactionLocked={
                      (draggingNodeId !== null || draggingBlockId !== null) &&
                      draggingBlockId !== block.id
                    }
                    onRename={(name) => handleRenameBlock(block.id, name)}
                    onToggleCollapsed={() => handleToggleBlockCollapsed(block.id)}
                    onToggleMemberRunning={(memberId) =>
                      handleToggleMemberRunning(block.id, memberId)
                    }
                    onOpenMemberSettings={(memberId) => {
                      const member = nodeById.get(memberId);
                      if (member?.mcpServerId !== undefined) {
                        handleOpenMcpPanel(member.mcpServerId);
                      }
                    }}
                    onDeleteMember={(memberId) => handleDeleteNode(memberId)}
                    onSeparateMember={(memberId) =>
                      handleDisconnectMember(block.id, memberId)
                    }
                    onBlockPointerDown={(event) => handleBlockPointerDown(block.id, event)}
                    onMemberPointerDown={(nodeId, event) =>
                      handleMemberPointerDown(nodeId, event)
                    }
                  />
                );
              })}

              {displayNodes
                .filter((node) => !node.blockId)
                .map((node) => (
                  <GraphNode
                    key={node.id}
                    node={node}
                    linkedMcpNames={linkedMcpNamesByAgent.get(node.id) ?? []}
                    isWireSource={wireDraft?.sourceId === node.id}
                    isHoverTarget={wireDraft?.hoverTargetId === node.id}
                    isDragging={draggingNodeId === node.id}
                    interactionLocked={
                      interactionPassthrough ||
                      (draggingNodeId !== null && draggingNodeId !== node.id) ||
                      draggingBlockId !== null
                    }
                    onToggleExpand={() => handleToggleExpand(node.id)}
                    running={node.type !== "mcp" || isMcpNodeActive(node)}
                    onOpenSettings={
                      node.type === "mcp" && node.mcpServerId !== undefined
                        ? () => handleOpenMcpPanel(node.mcpServerId!)
                        : undefined
                    }
                    onDelete={() => handleDeleteNode(node.id)}
                    onSeparate={
                      node.type === "mcp" && node.blockId
                        ? () => handleDisconnectMember(node.blockId!, node.id)
                        : undefined
                    }
                    onNodePointerDown={(event) => handleNodePointerDown(node.id, event)}
                  />
                ))}
            </div>

            {renderedEdges.map(({ edge, midpoint, tangentAngle, enabled }) => (
              <GraphEdgeControl
                key={`${edge.id}-control`}
                edge={{ ...edge, enabled }}
                midpoint={midpoint}
                tangentAngle={tangentAngle}
                pan={pan}
                zoom={zoom}
                onToggle={handleToggleEdge}
                hidden={draggingNodeId !== null || draggingBlockId !== null}
              />
            ))}

            {displayNodes.length === 0 ? (
              <YStack
                position="absolute"
                style={{ inset: 0 }}
                justify="center"
                items="center"
                pointerEvents="none"
                px={24}
              >
                <Text color={colors.muted} fontSize={14} text="center">
                  Drag to pan. + adds nodes. Group → draw area over MCP servers/blocks. Click node to wire.
                </Text>
              </YStack>
            ) : null}
          </div>
      </div>

      {graphLoading ? (
        <YStack
          position="absolute"
          items="center"
          justify="center"
          pointerEvents="none"
          style={{ inset: 0, zIndex: 50, background: "rgba(244, 245, 248, 0.72)" }}
        >
          <InlineLoader label="Loading topology…" minHeight={48} />
        </YStack>
      ) : null}
    </YStack>
  );
}
