import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { VerticalTreeNode } from "./verticalTreeRailMath";

type VerticalTreeMeasurements = {
  containerRef: (node: HTMLDivElement | null) => void;
  setNodeRef: (index: number) => (node: HTMLDivElement | null) => void;
  nodes: VerticalTreeNode[];
  height: number;
};

function nodesEqual(left: VerticalTreeNode[], right: VerticalTreeNode[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((node, index) => node.offsetY === right[index]?.offsetY);
}

export function useVerticalTreeMeasurements(
  itemCount: number,
  enabled = true,
): VerticalTreeMeasurements {
  const containerElementRef = useRef<HTMLDivElement | null>(null);
  const itemElementsRef = useRef<(HTMLDivElement | null)[]>([]);
  const nodesRef = useRef<VerticalTreeNode[]>([]);
  const heightRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const [nodes, setNodes] = useState<VerticalTreeNode[]>([]);
  const [height, setHeight] = useState(0);

  const remeasure = useCallback(() => {
    const container = containerElementRef.current;
    if (!container || !enabled || itemCount === 0) {
      const nextHeight = container?.scrollHeight ?? container?.offsetHeight ?? 0;
      if (!nodesEqual(nodesRef.current, []) || heightRef.current !== nextHeight) {
        nodesRef.current = [];
        heightRef.current = nextHeight;
        setNodes([]);
        setHeight(nextHeight);
      }
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    const nextNodes: VerticalTreeNode[] = [];

    for (let index = 0; index < itemCount; index += 1) {
      const item = itemElementsRef.current[index];
      if (!item) {
        continue;
      }
      const rect = item.getBoundingClientRect();
      nextNodes.push({
        offsetY: rect.top - containerTop + rect.height / 2,
      });
    }

    const nextHeight = container.scrollHeight;
    if (!nodesEqual(nodesRef.current, nextNodes) || heightRef.current !== nextHeight) {
      nodesRef.current = nextNodes;
      heightRef.current = nextHeight;
      setNodes(nextNodes);
      setHeight(nextHeight);
    }
  }, [enabled, itemCount]);

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
  }, [scheduleRemeasure, itemCount, enabled]);

  useLayoutEffect(() => {
    itemElementsRef.current.length = itemCount;

    const container = containerElementRef.current;
    if (!container || !enabled) {
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleRemeasure();
    });
    observer.observe(container);

    for (let index = 0; index < itemCount; index += 1) {
      const item = itemElementsRef.current[index];
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
  }, [enabled, itemCount, scheduleRemeasure]);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    containerElementRef.current = node;
  }, []);

  const setNodeRef = useCallback(
    (index: number) => (node: HTMLDivElement | null) => {
      itemElementsRef.current[index] = node;
    },
    [],
  );

  return {
    containerRef,
    setNodeRef,
    nodes,
    height,
  };
}
