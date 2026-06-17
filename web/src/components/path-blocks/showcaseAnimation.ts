export { HERO_SCROLL_VH, HERO_SNAP_STEPS } from "./heroSnapStates";

/** Triangle progress when scroll 9 begins (topology enlarged, showcase seed). */
export const SHOWCASE_PRIME_AT = 8 / 9;

const PHASES_PER_CYCLE = 3;
const UNDERLAP_PHASE = 0.34;

const SCROLL_9_START = 0.8;
const SCROLL_9_END = 0.9;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function phaseProgress(tInCycle: number, phaseIndex: number) {
  const phaseSize = 1 / PHASES_PER_CYCLE;
  return clamp01((tInCycle - phaseIndex * phaseSize) / phaseSize);
}

export function triangleProgressFromSection(sectionProgress: number) {
  const t = Math.min(1, Math.max(0, sectionProgress));

  if (t <= SCROLL_9_START) {
    return (t / SCROLL_9_START) * SHOWCASE_PRIME_AT;
  }

  if (t <= SCROLL_9_END) {
    const local = (t - SCROLL_9_START) / (SCROLL_9_END - SCROLL_9_START);
    return SHOWCASE_PRIME_AT + local * (1 - SHOWCASE_PRIME_AT);
  }

  return 1;
}

/** Dot above block 3 on last cycle; unfolds when the front block exits. */
export function showcaseFromTriangle(
  triangleProgress: number,
  cycleCount: number,
): { primed: boolean; reveal: number } {
  const cycleProgress = triangleProgress * cycleCount;
  const cycleIndex = Math.min(Math.floor(cycleProgress), cycleCount - 1);
  const tInCycle = clamp01(cycleProgress - cycleIndex);

  if (cycleIndex !== cycleCount - 1) {
    return { primed: false, reveal: 0 };
  }

  const phase3Start = 2 / PHASES_PER_CYCLE;
  if (tInCycle < phase3Start - 0.001) {
    return { primed: false, reveal: 0 };
  }

  const p3 = phaseProgress(tInCycle, 2);

  if (p3 <= UNDERLAP_PHASE) {
    return { primed: true, reveal: 0 };
  }

  const exitP = (p3 - UNDERLAP_PHASE) / (1 - UNDERLAP_PHASE);
  const reveal = 1 - (1 - exitP) ** 3;

  return { primed: true, reveal };
}

/** Extra scroll (step 10) — panel settles below nav column. */
export function showcaseSettleFromSection(sectionProgress: number) {
  if (sectionProgress <= SCROLL_9_END) {
    return 0;
  }

  const t = (sectionProgress - SCROLL_9_END) / (1 - SCROLL_9_END);
  return 1 - (1 - clamp01(t)) ** 3;
}

/** @deprecated Use showcaseFromTriangle — kept for section height math. */
export function showcasePrimedFromSection(sectionProgress: number) {
  return showcaseFromTriangle(
    triangleProgressFromSection(sectionProgress),
    3,
  ).primed;
}

/** @deprecated Use showcaseFromTriangle */
export function showcaseRevealFromSectionProgress(sectionProgress: number) {
  return showcaseFromTriangle(
    triangleProgressFromSection(sectionProgress),
    3,
  ).reveal;
}
