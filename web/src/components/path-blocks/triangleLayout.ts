import {
  PATH_ALIGN_SPAN,
  PATH_LEFT_BOTTOM_X,
  PATH_RIGHT_BOTTOM_X,
  PATH_SIDE_SLOPE,
  PATH_TOP_CENTER_X,
  PATH_VIEWBOX,
  PATH_WIDTH_RATIO,
} from "./pathShape";

const H = PATH_VIEWBOX.height;

/** Vertical gap between stacked blocks (included in total height & anchor math). */
export const BLOCK_GAP = 18;

export type TriangleBand = {
  kicker: string;
  s: number;
  y: number;
  blockH: number;
  tx: number;
  ty: number;
  title?: string;
  body?: string;
};

const BLOCK_DEFS = [
  { kicker: "Topology", scale: PATH_WIDTH_RATIO * PATH_WIDTH_RATIO },
  { kicker: "Installed", scale: PATH_WIDTH_RATIO },
  {
    kicker: "Market",
    scale: 1,
    title: "Registry-first discovery",
    body: "Browse MCP servers, resolve installs, and open cards without losing context.",
  },
] as const;

const GAP_COUNT = BLOCK_DEFS.length - 1;

function silhouetteBottomX(totalH: number, bottomY: number) {
  const span = totalH - bottomY;
  return {
    left: PATH_LEFT_BOTTOM_X + PATH_SIDE_SLOPE * span,
    right: PATH_RIGHT_BOTTOM_X - PATH_SIDE_SLOPE * span,
  };
}

/** Scale that places both bottom corners on the silhouette for a given span. */
export function scaleForSpan(span: number): number {
  return 1 - span / PATH_ALIGN_SPAN;
}

function stackHeight(scales: number[]): number {
  let y = 0;
  for (let i = 0; i < scales.length; i++) {
    y += H * scales[i]!;
    if (i < GAP_COUNT) {
      y += BLOCK_GAP;
    }
  }
  return y;
}

function nextScales(totalH: number, scales: number[]): number[] {
  let y = 0;
  const result: number[] = [];

  for (let i = 0; i < BLOCK_DEFS.length; i++) {
    const bottomY = y + H * scales[i]!;
    result.push(scaleForSpan(totalH - bottomY));
    y = bottomY + (i < GAP_COUNT ? BLOCK_GAP : 0);
  }

  return result;
}

/**
 * With BLOCK_GAP, nominal R²/R/1 scales cannot satisfy both side edges at once.
 * Iterate scale + totalH until every band fits the shared left/right silhouette.
 */
export function layoutAlignedTriangle(): { bands: TriangleBand[]; totalH: number } {
  let scales = BLOCK_DEFS.map((block) => block.scale);
  let totalH = stackHeight(scales);

  for (let iter = 0; iter < 24; iter++) {
    const candidate = nextScales(totalH, scales);
    const candidateTotalH = stackHeight(candidate);
    const delta = Math.max(
      ...candidate.map((value, index) => Math.abs(value - scales[index]!)),
    );

    scales = candidate;
    totalH = candidateTotalH;

    if (delta < 1e-6) {
      break;
    }
  }

  const bands: TriangleBand[] = [];
  let y = 0;

  for (let i = 0; i < BLOCK_DEFS.length; i++) {
    const block = BLOCK_DEFS[i]!;
    const s = scales[i]!;
    const blockH = H * s;
    const bottomY = y + blockH;
    const { left } = silhouetteBottomX(totalH, bottomY);
    const tx = left - s * PATH_LEFT_BOTTOM_X;
    const ty = bottomY - s * H;

    bands.push({
      kicker: block.kicker,
      s,
      y,
      blockH,
      tx,
      ty,
      ...("title" in block ? { title: block.title, body: block.body } : {}),
    });

    y = bottomY + (i < GAP_COUNT ? BLOCK_GAP : 0);
  }

  return { bands, totalH };
}

/** SVG transform: uniform scale with both side edges on the silhouette. */
export function bandTransform(band: TriangleBand): string {
  return `translate(${band.tx} ${band.ty}) scale(${band.s})`;
}

/**
 * Grow/shrink a band from its layout top-center (y fixed, expands downward).
 * Matches bandTransform when s === band.s.
 */
export function bandTransformGrowFromTop(band: TriangleBand, s: number): string {
  const cx = band.tx + band.s * PATH_TOP_CENTER_X;
  const cy = band.y;
  return `translate(${cx} ${cy}) scale(${s}) translate(${-PATH_TOP_CENTER_X} 0)`;
}

export type BandTransformState = {
  tx: number;
  ty: number;
  s: number;
};

export function bandToTransformState(band: TriangleBand): BandTransformState {
  return { tx: band.tx, ty: band.ty, s: band.s };
}

export function lerpBandTransformState(
  from: BandTransformState,
  to: BandTransformState,
  t: number,
): BandTransformState {
  return {
    tx: from.tx + (to.tx - from.tx) * t,
    ty: from.ty + (to.ty - from.ty) * t,
    s: from.s + (to.s - from.s) * t,
  };
}

export function bandTransformFromState(state: BandTransformState): string {
  return `translate(${state.tx} ${state.ty}) scale(${state.s})`;
}
