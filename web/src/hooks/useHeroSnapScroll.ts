"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useSectionScrollProgress } from "@/hooks/useSectionScrollProgress";
import {
  displayTargetFromOffset,
  heroAnimFromDisplayStep,
  msPerSnapStep,
  settledStepFromOffset,
  type HeroSnapAnim,
} from "@/components/path-blocks/heroSnapStates";

const SETTLE_EPSILON = 0.002;
const VELOCITY_DECAY = 0.9;
const GAP_BOOST = 0.18;
const PUBLISH_EPSILON = 0.0004;
const SCROLL_RESPONSE_BOOST = 1.35;

export function useHeroSnapScroll(
  sectionRef: RefObject<HTMLElement | null>,
): HeroSnapAnim {
  const { offsetPx, viewportPx } = useSectionScrollProgress(sectionRef);
  const [anim, setAnim] = useState<HeroSnapAnim>(() =>
    heroAnimFromDisplayStep(0),
  );

  const displayRef = useRef(0);
  const velocityRef = useRef(0);
  const rafRef = useRef(0);
  const scrollRef = useRef({ offsetPx, viewportPx, scrollY: 0, t: 0 });

  scrollRef.current = {
    offsetPx,
    viewportPx,
    scrollY: scrollRef.current.scrollY,
    t: scrollRef.current.t,
  };

  useEffect(() => {
    let active = true;
    let lastFrame = performance.now();
    let lastPublished = -1;

    const publish = (settledStep: number) => {
      if (Math.abs(displayRef.current - lastPublished) < PUBLISH_EPSILON) {
        return;
      }
      lastPublished = displayRef.current;
      setAnim({
        ...heroAnimFromDisplayStep(displayRef.current),
        targetStep: settledStep,
      });
    };

    const tick = (now: number) => {
      if (!active) return;
      rafRef.current = 0;

      const dt = Math.min(now - lastFrame, 48);
      lastFrame = now;

      const { offsetPx: offset, viewportPx: viewport } = scrollRef.current;
      const target = displayTargetFromOffset(offset, viewport);
      const settledStep = settledStepFromOffset(offset, viewport);
      const display = displayRef.current;
      const gap = target - display;

      velocityRef.current *= VELOCITY_DECAY;

      if (Math.abs(gap) > SETTLE_EPSILON) {
        let speed =
          (1 / msPerSnapStep(velocityRef.current)) *
          (1 + GAP_BOOST * Math.abs(gap));

        if (velocityRef.current > 180) {
          speed *= SCROLL_RESPONSE_BOOST;
        }

        const delta = Math.sign(gap) * speed * dt;
        displayRef.current =
          Math.abs(delta) >= Math.abs(gap) ? target : display + delta;
        publish(settledStep);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      displayRef.current = target;
      publish(settledStep);
    };

    const kick = () => {
      if (!rafRef.current) {
        lastFrame = performance.now();
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const onScroll = () => {
      const now = performance.now();
      const prev = scrollRef.current;
      const scrollDt = Math.max(now - prev.t, 1);
      const instant =
        (Math.abs(window.scrollY - prev.scrollY) / scrollDt) * 1000;

      velocityRef.current = velocityRef.current * 0.35 + instant * 0.65;
      scrollRef.current.scrollY = window.scrollY;
      scrollRef.current.t = now;
      kick();
    };

    scrollRef.current.scrollY = window.scrollY;
    scrollRef.current.t = performance.now();
    window.addEventListener("scroll", onScroll, { passive: true });
    kick();

    return () => {
      active = false;
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return anim;
}
