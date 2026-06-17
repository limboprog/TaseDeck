"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export type SectionScrollState = {
  progress: number;
  offsetPx: number;
  viewportPx: number;
  scrollablePx: number;
};

function readSectionScroll(bounds: { top: number; height: number }): SectionScrollState {
  const viewportPx = window.innerHeight;
  const max = Math.max(bounds.height - viewportPx, 1);
  const offsetPx = clamp(window.scrollY - bounds.top, 0, max);
  const progress = offsetPx / max;

  return { progress, offsetPx, viewportPx, scrollablePx: max };
}

export function useSectionScrollProgress(
  sectionRef: RefObject<HTMLElement | null>,
) {
  const [state, setState] = useState<SectionScrollState>({
    progress: 0,
    offsetPx: 0,
    viewportPx: 1,
    scrollablePx: 1,
  });
  const boundsRef = useRef({ top: 0, height: 1 });

  useLayoutEffect(() => {
    const measure = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      boundsRef.current = {
        top: rect.top + window.scrollY,
        height: el.offsetHeight,
      };
    };

    measure();
    window.addEventListener("resize", measure);
    const id = requestAnimationFrame(measure);

    return () => {
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(id);
    };
  }, [sectionRef]);

  useEffect(() => {
    let frame = 0;
    let lastProgress = -1;

    const update = () => {
      frame = 0;
      const next = readSectionScroll(boundsRef.current);
      if (Math.abs(next.progress - lastProgress) < 0.001) return;
      lastProgress = next.progress;
      setState(next);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return state;
}
