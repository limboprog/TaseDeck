/** Main fill path from `public/icons/path.svg` (viewBox 0 0 776 400). */
export const PATH_SHAPE_D =
  "M575.304 0C582.88 0 589.805 4.28005 593.193 11.0557L773.193 371.056C779.842 384.354 770.172 400 755.304 400H20.0257C5.15805 400 -4.51184 384.354 2.13717 371.056L182.137 11.0557C185.525 4.28005 192.45 0 200.026 0H575.304Z";

export const PATH_VIEWBOX = { width: 776, height: 400 } as const;

/** Bottom-left corner of the trapezoid in path coordinates. */
export const PATH_LEFT_BOTTOM_X = 20.0257;

/** Bottom-right corner of the trapezoid in path coordinates. */
export const PATH_RIGHT_BOTTOM_X = 755.304;

/** Top-left corner x on the path. */
export const PATH_LEFT_TOP_X = 200.026;

/** Left edge slope: Δx / Δy (path y grows downward). */
export const PATH_SIDE_SLOPE =
  (PATH_LEFT_TOP_X - PATH_LEFT_BOTTOM_X) / PATH_VIEWBOX.height;

/** Bottom edge width; used to relate vertical span and scale for dual-edge fit. */
export const PATH_BOTTOM_WIDTH =
  PATH_RIGHT_BOTTOM_X - PATH_LEFT_BOTTOM_X;

/** Span coefficient: bottomY + span * (1 - s) lands both bottom corners on silhouette. */
export const PATH_ALIGN_SPAN = PATH_BOTTOM_WIDTH / (2 * PATH_SIDE_SLOPE);

/** Top-right corner x on the path. */
export const PATH_RIGHT_TOP_X = 575.304;

/** Horizontal center of the path top edge. */
export const PATH_TOP_CENTER_X = (PATH_LEFT_TOP_X + PATH_RIGHT_TOP_X) / 2;

/** Top width / bottom width of path.svg. */
export const PATH_WIDTH_RATIO =
  (PATH_RIGHT_TOP_X - PATH_LEFT_TOP_X) / PATH_BOTTOM_WIDTH;
