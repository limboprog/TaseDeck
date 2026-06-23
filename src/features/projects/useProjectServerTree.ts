import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  resolveVerticalTreeHeight,
  type VerticalTreeCircleNode,
  type VerticalTreeNode,
} from "../../components/VerticalTreeRail/verticalTreeRailMath";

const SERVER_TREE_CIRCLE_RADIUS = 6;

export type ProjectServerTreeRailState = {
  trunkNodes: VerticalTreeNode[];
  circleNodes: VerticalTreeCircleNode[];
  dashedSpan?: { fromIndex: number; toIndex: number };
  height: number;
  ready: boolean;
};

const EMPTY_RAIL: ProjectServerTreeRailState = {
  trunkNodes: [],
  circleNodes: [],
  height: 0,
  ready: false,
};

function circlesEqual(left: VerticalTreeCircleNode[], right: VerticalTreeCircleNode[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (node, index) =>
      node.offsetY === right[index]?.offsetY && node.active === right[index]?.active,
  );
}

function railEqual(left: ProjectServerTreeRailState, right: ProjectServerTreeRailState) {
  return (
    left.ready === right.ready &&
    left.height === right.height &&
    left.dashedSpan?.fromIndex === right.dashedSpan?.fromIndex &&
    left.dashedSpan?.toIndex === right.dashedSpan?.toIndex &&
    left.trunkNodes.length === right.trunkNodes.length &&
    left.trunkNodes.every((node, index) => node.offsetY === right.trunkNodes[index]?.offsetY) &&
    circlesEqual(left.circleNodes, right.circleNodes)
  );
}

type UseProjectServerTreeOptions = {
  serverCount: number;
  pickerCount: number;
  addExpanded: boolean;
  hoveredPickerIndex: number | null;
  enabled: boolean;
};

export function useProjectServerTree({
  serverCount,
  pickerCount,
  addExpanded,
  hoveredPickerIndex,
  enabled,
}: UseProjectServerTreeOptions) {
  const containerElementRef = useRef<HTMLDivElement | null>(null);
  const serverElementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const addElementRef = useRef<HTMLDivElement | null>(null);
  const backElementRef = useRef<HTMLDivElement | null>(null);
  const pickerElementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const railRef = useRef<ProjectServerTreeRailState>(EMPTY_RAIL);
  const frameRef = useRef<number | null>(null);
  const [rail, setRail] = useState<ProjectServerTreeRailState>(EMPTY_RAIL);

  const remeasure = useCallback(() => {
    const container = containerElementRef.current;
    if (!container || !enabled) {
      const nextRail: ProjectServerTreeRailState = {
        trunkNodes: [],
        circleNodes: [],
        height: 0,
        ready: false,
      };
      if (!railEqual(railRef.current, nextRail)) {
        railRef.current = nextRail;
        setRail(nextRail);
      }
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    const trunkNodes: VerticalTreeNode[] = [];
    const circleNodes: VerticalTreeCircleNode[] = [];

    for (let index = 0; index < serverCount; index += 1) {
      const item = serverElementsRef.current[index];
      if (!item) {
        continue;
      }
      const rect = item.getBoundingClientRect();
      const offsetY = rect.top - containerTop + rect.height / 2;
      trunkNodes.push({ offsetY });
      circleNodes.push({ offsetY });
    }

    const addItem = addElementRef.current;
    if (addItem) {
      const rect = addItem.getBoundingClientRect();
      const offsetY = rect.top - containerTop + rect.height / 2;
      trunkNodes.push({ offsetY });
      circleNodes.push({ offsetY });
    }

    if (addExpanded) {
      for (let index = 0; index < pickerCount; index += 1) {
        const picker = pickerElementsRef.current[index];
        if (!picker) {
          continue;
        }
        const rect = picker.getBoundingClientRect();
        circleNodes.push({
          offsetY: rect.top - containerTop + rect.height / 2,
          active: hoveredPickerIndex === index,
        });
      }
    }

    const backItem = addExpanded ? backElementRef.current : null;
    if (backItem) {
      const rect = backItem.getBoundingClientRect();
      const offsetY = rect.top - containerTop + rect.height / 2;
      trunkNodes.push({ offsetY });
      circleNodes.push({ offsetY });
    }

    const expectedTrunkCount = serverCount + 1 + (addExpanded ? 1 : 0);
    const nextRail: ProjectServerTreeRailState = {
      trunkNodes,
      circleNodes,
      dashedSpan:
        addExpanded && expectedTrunkCount > serverCount + 1
          ? { fromIndex: serverCount, toIndex: serverCount + 1 }
          : undefined,
      height: resolveVerticalTreeHeight(trunkNodes, SERVER_TREE_CIRCLE_RADIUS),
      ready: trunkNodes.length === expectedTrunkCount,
    };

    if (!railEqual(railRef.current, nextRail)) {
      railRef.current = nextRail;
      setRail(nextRail);
    }
  }, [addExpanded, enabled, hoveredPickerIndex, pickerCount, serverCount]);

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
  }, [scheduleRemeasure, serverCount, pickerCount, addExpanded, hoveredPickerIndex, enabled]);

  useLayoutEffect(() => {
    serverElementsRef.current.length = serverCount;
    pickerElementsRef.current.length = pickerCount;

    const container = containerElementRef.current;
    if (!container || !enabled) {
      return;
    }

    const observer = new ResizeObserver(scheduleRemeasure);
    observer.observe(container);

    const observed = [
      ...serverElementsRef.current,
      addElementRef.current,
      backElementRef.current,
      ...pickerElementsRef.current,
    ];
    for (const item of observed) {
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
  }, [enabled, pickerCount, scheduleRemeasure, serverCount, addExpanded]);

  return {
    containerRef: useCallback((node: HTMLDivElement | null) => {
      containerElementRef.current = node;
    }, []),
    setServerRef: useCallback(
      (index: number) => (node: HTMLDivElement | null) => {
        serverElementsRef.current[index] = node;
      },
      [],
    ),
    setAddRef: useCallback((node: HTMLDivElement | null) => {
      addElementRef.current = node;
    }, []),
    setBackRef: useCallback((node: HTMLDivElement | null) => {
      backElementRef.current = node;
    }, []),
    setPickerRef: useCallback(
      (index: number) => (node: HTMLDivElement | null) => {
        pickerElementsRef.current[index] = node;
      },
      [],
    ),
    scheduleRemeasure,
    rail,
  };
}
