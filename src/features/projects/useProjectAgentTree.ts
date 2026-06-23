import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ProjectGitBranchTarget } from "../../components/ProjectGitTreeRail";
import type { ProjectGitHorizontalConnector } from "../../components/ProjectGitTreeRail/ProjectGitTreeRail";
import { PROJECT_TREE_TRUNK_START_Y } from "./projectLayout";

export type ProjectAgentTreeRailState = {
  branchTargets: ProjectGitBranchTarget[];
  horizontalConnectors: ProjectGitHorizontalConnector[];
  trunkStartY: number;
  canvasWidth: number;
  ready: boolean;
};

const EMPTY_RAIL: ProjectAgentTreeRailState = {
  branchTargets: [],
  horizontalConnectors: [],
  trunkStartY: 0,
  canvasWidth: 0,
  ready: false,
};

function branchTargetsEqual(
  left: ProjectGitBranchTarget[],
  right: ProjectGitBranchTarget[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (node, index) =>
      node.offsetY === right[index]?.offsetY && node.targetX === right[index]?.targetX,
  );
}

function horizontalConnectorsEqual(
  left: ProjectGitHorizontalConnector[],
  right: ProjectGitHorizontalConnector[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (node, index) =>
      node.startX === right[index]?.startX &&
      node.endX === right[index]?.endX &&
      node.centerY === right[index]?.centerY,
  );
}

function railEqual(left: ProjectAgentTreeRailState, right: ProjectAgentTreeRailState): boolean {
  return (
    left.ready === right.ready &&
    left.trunkStartY === right.trunkStartY &&
    left.canvasWidth === right.canvasWidth &&
    branchTargetsEqual(left.branchTargets, right.branchTargets) &&
    horizontalConnectorsEqual(left.horizontalConnectors, right.horizontalConnectors)
  );
}

type UseProjectAgentTreeOptions = {
  agentRowCount: number;
  showAddAgentRow: boolean;
  enabled: boolean;
  /** SVG `left` offset inside the project container — branch X coords are relative to this. */
  railLeft?: number;
};

export function useProjectAgentTree({
  agentRowCount,
  showAddAgentRow,
  enabled,
  railLeft = 0,
}: UseProjectAgentTreeOptions) {
  const containerElementRef = useRef<HTMLDivElement | null>(null);
  const headerElementRef = useRef<HTMLDivElement | null>(null);
  const agentRowElementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const agentRightElementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const presetElementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const addAgentElementRef = useRef<HTMLButtonElement | null>(null);
  const railRef = useRef<ProjectAgentTreeRailState>(EMPTY_RAIL);
  const frameRef = useRef<number | null>(null);
  const [rail, setRail] = useState<ProjectAgentTreeRailState>(EMPTY_RAIL);

  const remeasure = useCallback(() => {
    const container = containerElementRef.current;
    if (!container || !enabled) {
      const nextRail: ProjectAgentTreeRailState = {
        ...EMPTY_RAIL,
        canvasWidth: container?.clientWidth ?? 0,
      };
      if (!railEqual(railRef.current, nextRail)) {
        railRef.current = nextRail;
        setRail(nextRail);
      }
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    const containerLeft = container.getBoundingClientRect().left;
    const trunkStartY = PROJECT_TREE_TRUNK_START_Y;

    const branchTargets: ProjectGitBranchTarget[] = [];
    const horizontalConnectors: ProjectGitHorizontalConnector[] = [];

    for (let index = 0; index < agentRowCount; index += 1) {
      const agentRight = agentRightElementsRef.current[index];
      const preset = presetElementsRef.current[index];
      if (!agentRight) {
        continue;
      }
      const agentRect = agentRight.getBoundingClientRect();
      const branchY = Math.round(agentRect.top - containerTop + agentRect.height / 2);

      branchTargets.push({
        offsetY: branchY,
        targetX: Math.round(agentRect.left - containerLeft - railLeft),
      });

      if (preset) {
        const presetRect = preset.getBoundingClientRect();
        horizontalConnectors.push({
          startX: Math.round(agentRect.right - containerLeft - railLeft),
          endX: Math.round(presetRect.left - containerLeft - railLeft),
          centerY: branchY,
        });
      }
    }

    if (showAddAgentRow) {
      const addRow = addAgentElementRef.current;
      if (addRow) {
        const rect = addRow.getBoundingClientRect();
        branchTargets.push({
          offsetY: Math.round(rect.top - containerTop + rect.height / 2),
          targetX: Math.round(rect.left - containerLeft - railLeft),
        });
      }
    }

    const expectedBranches = agentRowCount + (showAddAgentRow ? 1 : 0);
    const nextRail: ProjectAgentTreeRailState = {
      branchTargets,
      horizontalConnectors,
      trunkStartY,
      canvasWidth: Math.max(Math.round(container.clientWidth - railLeft), 0),
      ready: branchTargets.length >= expectedBranches,
    };

    if (!railEqual(railRef.current, nextRail)) {
      railRef.current = nextRail;
      setRail(nextRail);
    }
  }, [agentRowCount, enabled, railLeft, showAddAgentRow]);

  const scheduleRemeasure = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      remeasure();
    });
  }, [remeasure]);

  useLayoutEffect(() => {
    scheduleRemeasure();
  }, [scheduleRemeasure, agentRowCount, showAddAgentRow, enabled]);

  useLayoutEffect(() => {
    agentRowElementsRef.current.length = agentRowCount;
    agentRightElementsRef.current.length = agentRowCount;
    presetElementsRef.current.length = agentRowCount;

    const container = containerElementRef.current;
    if (!container || !enabled) {
      return;
    }

    const observer = new ResizeObserver(scheduleRemeasure);
    observer.observe(container);
    if (headerElementRef.current) {
      observer.observe(headerElementRef.current);
    }

    for (const item of [
      ...agentRowElementsRef.current,
      ...agentRightElementsRef.current,
      ...presetElementsRef.current,
      addAgentElementRef.current,
    ]) {
      if (item) {
        observer.observe(item);
      }
    }

    return () => {
      observer.disconnect();
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [agentRowCount, enabled, scheduleRemeasure, showAddAgentRow]);

  return {
    containerRef: useCallback((node: HTMLDivElement | null) => {
      containerElementRef.current = node;
    }, []),
    headerRef: useCallback((node: HTMLDivElement | null) => {
      headerElementRef.current = node;
    }, []),
    setAgentRowRef: useCallback(
      (index: number) => (node: HTMLDivElement | null) => {
        agentRowElementsRef.current[index] = node;
      },
      [],
    ),
    setAgentRightRef: useCallback(
      (index: number) => (node: HTMLDivElement | null) => {
        agentRightElementsRef.current[index] = node;
      },
      [],
    ),
    setPresetRef: useCallback(
      (index: number) => (node: HTMLDivElement | null) => {
        presetElementsRef.current[index] = node;
      },
      [],
    ),
    setAddAgentRef: useCallback((node: HTMLButtonElement | null) => {
      addAgentElementRef.current = node;
    }, []),
    scheduleRemeasure,
    rail,
  };
}
