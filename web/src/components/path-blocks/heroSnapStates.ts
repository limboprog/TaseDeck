import { SCROLL_CYCLES } from "./blockContents";
import { easeOutCubic } from "./triangleAnimation";

/**
 * Five visible hero states:
 * 0 — initial triangle
 * 1 — first front block enlarged (Market)
 * 2 — first exited, second enlarged (Installed)
 * 3 — second exited, third enlarged (Topology)
 * 4 — third exited, showcase open
 */
export const HERO_SNAP_STEPS = 5;

/** Scroll budget per snap state (larger = more room to read). */
export const SNAP_ZONE_VH = 200;

export const HERO_SCROLL_VH = SNAP_ZONE_VH * HERO_SNAP_STEPS + 100;

/** Plateau near each state center — stable for reading. */
const ZONE_PLATEAU_EDGE = 0.1;

const PHASES_PER_CYCLE = 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Triangle progress at the end of phase 2 within a cycle (front block enlarged). */
function enlargedProgressAtCycle(cycle: number) {
  const tInCycle = 2 / PHASES_PER_CYCLE;
  return (cycle + tInCycle) / SCROLL_CYCLES;
}

const TRIANGLE_KEYFRAMES = [
  0,
  enlargedProgressAtCycle(0),
  enlargedProgressAtCycle(1),
  enlargedProgressAtCycle(2),
  1,
] as const;

const SHOWCASE_KEYFRAMES = [0, 0, 0, 0, 1] as const;

export type HeroSnapAnim = {
  displayStep: number;
  targetStep: number;
  triangleProgress: number;
  showcaseReveal: number;
  showcasePrimed: boolean;
};

function segmentLocalT(rawLocal: number, segmentIndex: number) {
  if (segmentIndex === 0) {
    return easeOutCubic(rawLocal);
  }

  /** Short beat on enlarged card — keeps exit smooth without feeling late. */
  const HOLD = 0.05;
  if (rawLocal <= HOLD) {
    return 0;
  }

  return easeInOutCubic((rawLocal - HOLD) / (1 - HOLD));
}

/** Exit segments spend more time on the fly-away portion. */
function triangleProgressForSegment(segmentIndex: number, local: number) {
  const from = TRIANGLE_KEYFRAMES[segmentIndex]!;
  const to = TRIANGLE_KEYFRAMES[segmentIndex + 1]!;

  if (segmentIndex === 0) {
    return lerp(from, to, local);
  }

  const span = to - from;
  const exitEnd = from + span / 3;
  const EXIT_TIME_SHARE = 0.58;

  if (local < EXIT_TIME_SHARE) {
    const t = local / EXIT_TIME_SHARE;
    return lerp(from, exitEnd, easeInOutCubic(t));
  }

  const t = (local - EXIT_TIME_SHARE) / (1 - EXIT_TIME_SHARE);
  return lerp(exitEnd, to, easeOutCubic(t));
}

export function heroAnimFromDisplayStep(displayStep: number): HeroSnapAnim {
  const max = HERO_SNAP_STEPS - 1;
  const clamped = clamp(displayStep, 0, max);
  const index = Math.min(Math.floor(clamped), max - 1);
  const rawLocal = clamped - index;
  const local = segmentLocalT(rawLocal, index);

  const triangleProgress = triangleProgressForSegment(index, local);
  const showcaseReveal = lerp(
    SHOWCASE_KEYFRAMES[index]!,
    SHOWCASE_KEYFRAMES[index + 1]!,
    index === 3 ? easeInOutCubic(local) : local,
  );

  return {
    displayStep: clamped,
    targetStep: Math.round(clamped),
    triangleProgress,
    showcaseReveal,
    showcasePrimed: showcaseReveal > 0.02 || index >= 3,
  };
}

/**
 * Scroll → animation target. Plateaus at state centers; transition band
 * starts early so motion is visible before the user leaves the zone.
 */
export function displayTargetFromOffset(offsetPx: number, viewportPx: number) {
  const max = HERO_SNAP_STEPS - 1;

  if (viewportPx <= 0) {
    return 0;
  }

  const zonePx = (SNAP_ZONE_VH / 100) * viewportPx;
  const raw = clamp(offsetPx / zonePx, 0, max);
  const i = Math.min(Math.floor(raw), max - 1);
  const local = raw - i;

  if (local <= ZONE_PLATEAU_EDGE) {
    return i;
  }

  if (local >= 1 - ZONE_PLATEAU_EDGE) {
    return Math.min(i + 1, max);
  }

  const t = (local - ZONE_PLATEAU_EDGE) / (1 - 2 * ZONE_PLATEAU_EDGE);
  return i + easeOutCubic(t);
}

export function settledStepFromOffset(offsetPx: number, viewportPx: number) {
  return Math.round(displayTargetFromOffset(offsetPx, viewportPx));
}

/** @deprecated Use displayTargetFromOffset */
export function targetStepFromOffset(
  offsetPx: number,
  viewportPx: number,
  committedStep: number,
) {
  void committedStep;
  return settledStepFromOffset(offsetPx, viewportPx);
}

/** ms to travel one snap step; faster scroll → shorter duration. */
export function msPerSnapStep(velocityPxPerSec: number) {
  const slow = 250;
  const fast = 3200;
  const t = clamp((velocityPxPerSec - slow) / (fast - slow), 0, 1);
  return lerp(1500, 720, t);
}
