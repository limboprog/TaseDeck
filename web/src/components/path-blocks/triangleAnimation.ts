/** Layout scale at scroll start (standard / full size). */
export const BOTTOM_SCALE_REST = 1;

/** After scroll step 1 within a cycle. */
export const BOTTOM_SCALE_STEP_1 = 1.08;

/** After scroll step 2 — bottom block approaches viewer. */
export const BOTTOM_SCALE_STEP_2 = 1.16;

/** Front block scale at end of exit. */
export const BOTTOM_SCALE_EXIT = 3;

const PHASES_PER_CYCLE = 3;

/** Mid/top slide under the front block this far before it exits. */
const SLOT_UNDERLAP = 1 / 3;

/** First part of step 3: only top + mid move; front block stays still. */
const UNDERLAP_PHASE = 0.42;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

export function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeInCubic(t: number) {
  return t ** 3;
}

function easeInQuint(t: number) {
  return t ** 5;
}

function phaseProgress(cycleProgress: number, phaseIndex: number) {
  const phaseSize = 1 / PHASES_PER_CYCLE;
  return clamp01((cycleProgress - phaseIndex * phaseSize) / phaseSize);
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function exitScaleT(t: number) {
  return easeOutCubic(t) * 0.55 + easeInQuint(t) * 0.45;
}

function exitDropT(t: number) {
  return easeOutCubic(clamp01((t - 0.02) / 0.98));
}

export type TriangleAnimState = {
  bottomScaleFactor: number;
  extraTextOpacity: number;
  bottomExitY: number;
  bottomOpacity: number;
  slotShift: number;
  cycleIndex: number;
  cycleProgress: number;
};

function phase3State(
  p3: number,
  bottomBlockHeightAtPeak: number,
  cycleIndex: number,
  tInCycle: number,
): TriangleAnimState {
  /** Step 3a — top + mid shift; front block frozen on top. */
  if (p3 < UNDERLAP_PHASE) {
    const t = easeOutCubic(p3 / UNDERLAP_PHASE);

    return {
      slotShift: t * SLOT_UNDERLAP,
      bottomScaleFactor: BOTTOM_SCALE_STEP_2,
      extraTextOpacity: 1,
      bottomExitY: 0,
      bottomOpacity: 1,
      cycleIndex,
      cycleProgress: tInCycle,
    };
  }

  /** Step 3b — front exits after mid is 1/3 under; slots finish shifting. */
  const exitP = (p3 - UNDERLAP_PHASE) / (1 - UNDERLAP_PHASE);
  const exitEased = easeInOutCubic(exitP);
  const scaleT = exitScaleT(exitEased);
  const dropT = exitDropT(exitEased);
  const slotTail = easeOutCubic(exitEased);
  const fadeStart = 0.5;
  const fadeT =
    exitP <= fadeStart ? 0 : clamp01((exitP - fadeStart) / (1 - fadeStart));

  return {
    slotShift: SLOT_UNDERLAP + slotTail * (1 - SLOT_UNDERLAP),
    bottomScaleFactor: lerp(BOTTOM_SCALE_STEP_2, BOTTOM_SCALE_EXIT, scaleT),
    extraTextOpacity: 1 - fadeT * 0.85,
    bottomExitY: dropT * bottomBlockHeightAtPeak * (1.2 + scaleT * 1.4),
    bottomOpacity: 1 - easeOutCubic(fadeT),
    cycleIndex,
    cycleProgress: tInCycle,
  };
}

export function triangleAnimFromSectionProgress(
  progress: number,
  bottomBlockHeightAtPeak: number,
  cycleCount: number,
): TriangleAnimState {
  const cycleProgress = progress * cycleCount;
  const cycleIndex = Math.min(Math.floor(cycleProgress), cycleCount - 1);
  const tInCycle = clamp01(cycleProgress - cycleIndex);

  const p1 = phaseProgress(tInCycle, 0);
  const p2 = phaseProgress(tInCycle, 1);
  const p3 = phaseProgress(tInCycle, 2);

  if (tInCycle < 1 / PHASES_PER_CYCLE) {
    return {
      bottomScaleFactor: lerp(
        BOTTOM_SCALE_REST,
        BOTTOM_SCALE_STEP_1,
        p1,
      ),
      extraTextOpacity: 0,
      bottomExitY: 0,
      bottomOpacity: 1,
      slotShift: 0,
      cycleIndex,
      cycleProgress: tInCycle,
    };
  }

  if (tInCycle < 2 / PHASES_PER_CYCLE) {
    return {
      bottomScaleFactor: lerp(
        BOTTOM_SCALE_STEP_1,
        BOTTOM_SCALE_STEP_2,
        p2,
      ),
      extraTextOpacity: p2,
      bottomExitY: 0,
      bottomOpacity: 1,
      slotShift: 0,
      cycleIndex,
      cycleProgress: tInCycle,
    };
  }

  return phase3State(p3, bottomBlockHeightAtPeak, cycleIndex, tInCycle);
}
