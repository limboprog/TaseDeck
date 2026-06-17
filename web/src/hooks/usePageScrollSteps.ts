"use client";

import { useEffect, useRef, useState } from "react";

export type PageScrollSteps = {
  stepProgress: number;
  stepIndex: number;
  pageProgress: number;
};

const defaultState: PageScrollSteps = {
  stepProgress: 0,
  stepIndex: 0,
  pageProgress: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readScrollSteps(): PageScrollSteps {
  if (typeof window === "undefined") return defaultState;

  const maxScroll = Math.max(
    document.documentElement.scrollHeight - window.innerHeight,
    1,
  );
  const scrollY = Math.max(0, window.scrollY);
  const pageProgress = clamp(scrollY / maxScroll, 0, 1);
  const stepHeight = maxScroll * 0.1;
  const stepIndex = Math.max(0, Math.floor(scrollY / stepHeight));
  const stepStart = stepIndex * stepHeight;
  const stepProgress =
    stepHeight > 0 ? clamp((scrollY - stepStart) / stepHeight, 0, 1) : 0;

  return { stepProgress, stepIndex, pageProgress };
}

function stepsEqual(a: PageScrollSteps, b: PageScrollSteps) {
  return (
    a.stepIndex === b.stepIndex &&
    Math.abs(a.stepProgress - b.stepProgress) < 0.002 &&
    Math.abs(a.pageProgress - b.pageProgress) < 0.002
  );
}

export function usePageScrollSteps(): PageScrollSteps {
  const [state, setState] = useState<PageScrollSteps>(defaultState);
  const lastRef = useRef(defaultState);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const next = readScrollSteps();
      if (stepsEqual(lastRef.current, next)) return;
      lastRef.current = next;
      setState(next);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return state;
}
