export function scrollElementToTopWithinContainer(
  container: HTMLElement,
  element: HTMLElement,
  offset = 8,
  behavior: ScrollBehavior = "auto",
) {
  const containerTop = container.getBoundingClientRect().top;
  const elementTop = element.getBoundingClientRect().top;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const nextTop = Math.min(
    Math.max(0, container.scrollTop + elementTop - containerTop - offset),
    maxScroll,
  );
  container.scrollTo({ top: nextTop, behavior });
}

export function scrollElementToTopOfScrollParent(element: HTMLElement, offset = 8) {
  const scrollParent = element.closest(".td-scroll-y") as HTMLElement | null;
  if (!scrollParent) {
    return;
  }
  scrollElementToTopWithinContainer(scrollParent, element, offset);
}

/** After collapsible content shrinks, clamp scroll and keep anchor visible. */
export function clampScrollParentAndRevealAnchor(anchor: HTMLElement, margin = 8) {
  const scrollParent = anchor.closest(".td-scroll-y") as HTMLElement | null;
  if (!scrollParent) {
    anchor.scrollIntoView({ block: "nearest", behavior: "auto" });
    return;
  }

  const maxScroll = () =>
    Math.max(0, scrollParent.scrollHeight - scrollParent.clientHeight);

  scrollParent.scrollTop = Math.min(scrollParent.scrollTop, maxScroll());

  const parentRect = scrollParent.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();

  if (anchorRect.bottom > parentRect.bottom - margin) {
    scrollParent.scrollTop += anchorRect.bottom - (parentRect.bottom - margin);
  } else if (anchorRect.top < parentRect.top + margin) {
    scrollParent.scrollTop -= parentRect.top + margin - anchorRect.top;
  }

  scrollParent.scrollTop = Math.min(Math.max(0, scrollParent.scrollTop), maxScroll());

  // Collapse can leave scrollTop past the new max until the browser reclamps.
  if (scrollParent.scrollTop > maxScroll()) {
    scrollParent.scrollTop = maxScroll();
  }
}
