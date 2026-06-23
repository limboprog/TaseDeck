import { PROJECT_NAV_SCROLL_OFFSET } from "./projectLayout";

/** Offset from scrollport top when navigating to an agent (clears sticky header). */
export const PROJECT_SCROLL_ANCHOR = PROJECT_NAV_SCROLL_OFFSET;

export function getScrollRange(container: HTMLElement): number {
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

export function clampScrollContainer(container: HTMLElement | null) {
  if (!container) {
    return;
  }
  const max = getScrollRange(container);
  if (container.scrollTop > max) {
    container.scrollTop = max;
  }
  if (container.scrollTop < 0) {
    container.scrollTop = 0;
  }
}

export function resetScrollContainer(container: HTMLElement | null) {
  if (!container) {
    return;
  }
  container.scrollTop = 0;
}

/** Run after DOM height changes (collapse panels, etc.). */
export function reconcileScrollContainer(container: HTMLElement | null) {
  if (!container) {
    return;
  }
  requestAnimationFrame(() => {
    clampScrollContainer(container);
    requestAnimationFrame(() => {
      clampScrollContainer(container);
    });
  });
}

/** Apply a state update without moving the user's scroll position. */
export function runPreservingScroll(container: HTMLElement | null, update: () => void) {
  if (!container) {
    update();
    return;
  }

  const scrollTop = container.scrollTop;
  update();
  requestAnimationFrame(() => {
    const max = getScrollRange(container);
    container.scrollTop = Math.min(scrollTop, max);
    reconcileScrollContainer(container);
  });
}
