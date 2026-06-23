import { useCallback, useEffect, useRef, useState } from "react";
import { scrollElementToTopWithinContainer } from "../mcp/detailPanelScroll";
import {
  clampScrollContainer,
  getScrollRange,
  PROJECT_SCROLL_ANCHOR,
  reconcileScrollContainer,
  resetScrollContainer,
} from "./projectScroll";

/** @deprecated Use PROJECT_SCROLL_ANCHOR */
export const NAV_SCROLL_ANCHOR = PROJECT_SCROLL_ANCHOR;

export const NAV_NODE_GAP = 46;
export const NAV_TREE_START = 14;

export type ProjectNavigationState = {
  activeAgentId: number | null;
  activeOffset: number;
  activeFraction: number;
  canScroll: boolean;
};

function measureIndexFromScroll(
  scrollRoot: HTMLElement,
  agentIds: number[],
  getSectionElement: (agentId: number) => HTMLElement | null,
): number {
  if (agentIds.length === 0) {
    return 0;
  }

  const maxScroll = getScrollRange(scrollRoot);
  if (maxScroll <= 1) {
    return 0;
  }

  if (scrollRoot.scrollTop <= 2) {
    return 0;
  }

  if (scrollRoot.scrollTop >= maxScroll - 2) {
    return agentIds.length - 1;
  }

  const rootTop = scrollRoot.getBoundingClientRect().top;
  const focusY = scrollRoot.scrollTop + PROJECT_SCROLL_ANCHOR;

  const tops = agentIds.map((agentId) => {
    const element = getSectionElement(agentId);
    if (!element) {
      return Number.NaN;
    }
    const rect = element.getBoundingClientRect();
    return scrollRoot.scrollTop + (rect.top - rootTop);
  });

  const firstValid = tops.findIndex((top) => Number.isFinite(top));
  if (firstValid < 0) {
    return 0;
  }

  if (focusY <= tops[firstValid]!) {
    return firstValid;
  }

  for (let index = firstValid; index < agentIds.length - 1; index += 1) {
    const currentTop = tops[index]!;
    const nextTop = tops[index + 1]!;
    if (!Number.isFinite(currentTop) || !Number.isFinite(nextTop)) {
      continue;
    }
    if (focusY < nextTop) {
      const span = nextTop - currentTop;
      if (span <= 0) {
        return index;
      }
      const blend = (focusY - currentTop) / span;
      return index + Math.max(0, Math.min(1, blend));
    }
  }

  return agentIds.length - 1;
}

type UseProjectNavigationStateOptions = {
  scrollRootRef: React.RefObject<HTMLElement | null>;
  agentIds: number[];
  getSectionElement: (agentId: number) => HTMLElement | null;
  enabled: boolean;
  resetKey: string;
};

export function useProjectNavigationState({
  scrollRootRef,
  agentIds,
  getSectionElement,
  enabled,
  resetKey,
}: UseProjectNavigationStateOptions) {
  const [activeAgentId, setActiveAgentId] = useState<number | null>(null);
  const [canScroll, setCanScroll] = useState(false);
  const frameRef = useRef<number | null>(null);
  const activeAgentIdRef = useRef<number | null>(null);
  const canScrollRef = useRef(false);
  const getSectionElementRef = useRef(getSectionElement);
  const scrollSpyPausedUntilRef = useRef(0);

  useEffect(() => {
    getSectionElementRef.current = getSectionElement;
  }, [getSectionElement]);

  useEffect(() => {
    activeAgentIdRef.current = activeAgentId;
  }, [activeAgentId]);

  useEffect(() => {
    canScrollRef.current = canScroll;
  }, [canScroll]);

  useEffect(() => {
    const firstId = agentIds[0] ?? null;
    setActiveAgentId(firstId);
    activeAgentIdRef.current = firstId;
    scrollSpyPausedUntilRef.current = 0;
    resetScrollContainer(scrollRootRef.current);
    setCanScroll(false);
    canScrollRef.current = false;
  }, [resetKey, scrollRootRef]);

  useEffect(() => {
    const currentActive = activeAgentIdRef.current;
    if (currentActive == null || agentIds.includes(currentActive)) {
      return;
    }

    const nextId = agentIds[0] ?? null;
    activeAgentIdRef.current = nextId;
    setActiveAgentId(nextId);
  }, [agentIds]);

  const syncScrollCapability = useCallback(() => {
    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot) {
      return false;
    }
    clampScrollContainer(scrollRoot);
    const nextCanScroll = getScrollRange(scrollRoot) > 1;
    if (canScrollRef.current !== nextCanScroll) {
      canScrollRef.current = nextCanScroll;
      setCanScroll(nextCanScroll);
    }
    return nextCanScroll;
  }, [scrollRootRef]);

  const applyScrollSpy = useCallback(() => {
    if (performance.now() < scrollSpyPausedUntilRef.current) {
      return;
    }

    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot || !enabled || agentIds.length === 0) {
      return;
    }

    if (!syncScrollCapability()) {
      return;
    }

    const offset = measureIndexFromScroll(
      scrollRoot,
      agentIds,
      getSectionElementRef.current,
    );
    const nextId = agentIds[Math.min(Math.max(0, Math.round(offset)), agentIds.length - 1)] ?? null;
    if (nextId != null && nextId !== activeAgentIdRef.current) {
      activeAgentIdRef.current = nextId;
      setActiveAgentId(nextId);
    }
  }, [agentIds, enabled, scrollRootRef, syncScrollCapability]);

  const scheduleScrollSpy = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      applyScrollSpy();
    });
  }, [applyScrollSpy]);

  const clampScroll = useCallback(() => {
    reconcileScrollContainer(scrollRootRef.current);
    syncScrollCapability();
    scheduleScrollSpy();
  }, [scheduleScrollSpy, scrollRootRef, syncScrollCapability]);

  const selectAgent = useCallback(
    (agentId: number) => {
      if (!agentIds.includes(agentId)) {
        return;
      }

      activeAgentIdRef.current = agentId;
      setActiveAgentId(agentId);
      scrollSpyPausedUntilRef.current = performance.now() + 450;

      const scrollRoot = scrollRootRef.current;
      const section = getSectionElementRef.current(agentId);
      if (!scrollRoot || !section) {
        return;
      }

      const nextCanScroll = syncScrollCapability();
      if (nextCanScroll) {
        scrollElementToTopWithinContainer(
          scrollRoot,
          section,
          PROJECT_SCROLL_ANCHOR,
          "smooth",
        );
      }
    },
    [agentIds, scrollRootRef, syncScrollCapability],
  );

  const activeIndex = activeAgentId != null ? Math.max(0, agentIds.indexOf(activeAgentId)) : 0;
  const navigation: ProjectNavigationState = {
    activeAgentId,
    activeOffset: activeIndex < 0 ? 0 : activeIndex,
    activeFraction: 0,
    canScroll,
  };

  useEffect(() => {
    syncScrollCapability();
    scheduleScrollSpy();
  }, [agentIds, enabled, resetKey, scheduleScrollSpy, syncScrollCapability]);

  useEffect(() => {
    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot || !enabled) {
      return;
    }

    const onScroll = () => {
      scheduleScrollSpy();
    };

    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => {
      reconcileScrollContainer(scrollRoot);
      syncScrollCapability();
      scheduleScrollSpy();
    });
    observer.observe(scrollRoot);

    const content = scrollRoot.firstElementChild;
    if (content instanceof HTMLElement) {
      observer.observe(content);
    }

    return () => {
      scrollRoot.removeEventListener("scroll", onScroll);
      observer.disconnect();
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [agentIds, enabled, resetKey, scheduleScrollSpy, scrollRootRef, syncScrollCapability]);

  return { navigation, remeasureNavigation: scheduleScrollSpy, clampScroll, selectAgent };
}

export function resolveNavNodeY(index: number): number {
  return NAV_TREE_START + index * NAV_NODE_GAP;
}

export function resolveNavTreeHeight(nodeCount: number): number {
  if (nodeCount <= 0) {
    return NAV_TREE_START + 16;
  }
  return resolveNavNodeY(nodeCount - 1) + 24;
}

export function resolveNavHighlightY(activeOffset: number, nodeCount: number): number {
  if (nodeCount <= 0) {
    return NAV_TREE_START;
  }
  const clamped = Math.max(0, Math.min(activeOffset, nodeCount - 1));
  return resolveNavNodeY(Math.round(clamped));
}

export function resolveNavEdgeExtensions(): { up: number; down: number } {
  return { up: 0, down: 0 };
}
