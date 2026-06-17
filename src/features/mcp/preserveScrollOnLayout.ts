import { flushSync } from "react-dom";

export function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return current;
    }
    current = current.parentElement;
  }

  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : null;
}

/** Row wrappers use `display: contents` — anchor on the first cell. */
export function getTableRowAnchor(row: Element): HTMLElement | null {
  if (row instanceof HTMLElement) {
    const rect = row.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return row;
    }
    const first = row.firstElementChild;
    if (first instanceof HTMLElement) {
      return first;
    }
  }
  return null;
}

/**
 * Keeps `anchor` at the same viewport position after `action` changes layout
 * (accordion / table row expand grows content downward).
 */
export function preserveScrollWhile(
  scrollParent: HTMLElement | null,
  anchor: HTMLElement | null,
  action: () => void,
): void {
  if (!scrollParent || !anchor) {
    action();
    return;
  }

  const scrollTopBefore = scrollParent.scrollTop;
  const anchorTopBefore = anchor.getBoundingClientRect().top;

  flushSync(() => {
    action();
  });

  const restore = () => {
    const anchorTopAfter = anchor.getBoundingClientRect().top;
    const delta = anchorTopAfter - anchorTopBefore;
    if (Math.abs(delta) > 0.5) {
      scrollParent.scrollTop = scrollTopBefore + delta;
    }
  };

  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}
