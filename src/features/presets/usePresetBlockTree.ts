import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { VerticalTreeCircleNode, VerticalTreeNode } from "../../components/VerticalTreeRail/verticalTreeRailMath";

export type PresetTreeRailState = {
  trunkNodes: VerticalTreeNode[];
  circleNodes: VerticalTreeCircleNode[];
  dashedSpan?: { fromIndex: number; toIndex: number };
  height: number;
  ready: boolean;
};

const EMPTY_RAIL: PresetTreeRailState = {
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

function railEqual(left: PresetTreeRailState, right: PresetTreeRailState) {
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

type UsePresetBlockTreeOptions = {
  serverCount: number;
  pickerCount: number;
  addExpanded: boolean;
  hoveredPickerIndex: number | null;
  enabled: boolean;
};

export function usePresetBlockTree({
  serverCount,
  pickerCount,
  addExpanded,
  hoveredPickerIndex,
  enabled,
}: UsePresetBlockTreeOptions) {
  const containerElementRef = useRef<HTMLDivElement | null>(null);
  const serverElementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const addElementRef = useRef<HTMLDivElement | null>(null);
  const backElementRef = useRef<HTMLDivElement | null>(null);
  const pickerElementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const railRef = useRef<PresetTreeRailState>(EMPTY_RAIL);
  const frameRef = useRef<number | null>(null);
  const [rail, setRail] = useState<PresetTreeRailState>(EMPTY_RAIL);

  const remeasure = useCallback(() => {
    const container = containerElementRef.current;
    if (!container || !enabled) {
      const nextHeight = container?.scrollHeight ?? 0;
      const nextRail: PresetTreeRailState = {
        trunkNodes: [],
        circleNodes: [],
        height: nextHeight,
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
    const nextRail: PresetTreeRailState = {
      trunkNodes,
      circleNodes,
      dashedSpan:
        addExpanded && expectedTrunkCount > serverCount + 1
          ? { fromIndex: serverCount, toIndex: serverCount + 1 }
          : undefined,
      height: container.scrollHeight,
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

    const observer = new ResizeObserver(() => {
      scheduleRemeasure();
    });
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
        frameRef.current = null;
      }
    };
  }, [enabled, pickerCount, scheduleRemeasure, serverCount, addExpanded]);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerElementRef.current = node;
  }, []);

  const setServerRef = useCallback(
    (index: number) => (node: HTMLDivElement | null) => {
      serverElementsRef.current[index] = node;
    },
    [],
  );

  const setAddRef = useCallback((node: HTMLDivElement | null) => {
    addElementRef.current = node;
  }, []);

  const setPickerRef = useCallback(
    (index: number) => (node: HTMLDivElement | null) => {
      pickerElementsRef.current[index] = node;
    },
    [],
  );

  const setBackRef = useCallback((node: HTMLDivElement | null) => {
    backElementRef.current = node;
  }, []);

  return {
    containerRef,
    setServerRef,
    setAddRef,
    setBackRef,
    setPickerRef,
    rail,
  };
}
