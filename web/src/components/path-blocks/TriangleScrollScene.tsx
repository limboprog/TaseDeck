"use client";

import { useId, useMemo, useRef } from "react";
import { useHeroSnapScroll } from "@/hooks/useHeroSnapScroll";
import { AppShowcase } from "./AppShowcase";
import { HERO_SCROLL_VH } from "./heroSnapStates";
import {
  BLOCK_CONTENTS,
  SCROLL_CYCLES,
  slotContentsAtCycle,
  type BlockContent,
} from "./blockContents";
import { PATH_SHAPE_D, PATH_VIEWBOX } from "./pathShape";
import {
  triangleAnimFromSectionProgress,
  BOTTOM_SCALE_STEP_2,
} from "./triangleAnimation";
import {
  bandTransform,
  bandTransformFromState,
  bandTransformGrowFromTop,
  bandToTransformState,
  layoutAlignedTriangle,
  lerpBandTransformState,
} from "./triangleLayout";

const W = PATH_VIEWBOX.width;
const H = PATH_VIEWBOX.height;

const SCENE_SCROLL_VH = HERO_SCROLL_VH;

type PathBlockGraphicProps = {
  shineId: string;
  content: BlockContent;
  transform: string;
  opacity?: number;
  extraLineOpacity?: number;
};

function PathBlockGraphic({
  shineId,
  content,
  transform,
  opacity = 1,
  extraLineOpacity = 0,
}: PathBlockGraphicProps) {
  return (
    <g transform={transform} opacity={opacity}>
      <path
        d={PATH_SHAPE_D}
        fill="var(--color-glass-fill)"
        stroke="var(--color-glass-border)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <path d={PATH_SHAPE_D} fill={`url(#${shineId})`} stroke="none" />

      <foreignObject x="70" y="210" width="636" height="175">
        <div className="flex h-full flex-col justify-end pb-6">
          {content.title ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent sm:text-sm">
                {content.kicker}
              </p>
              <h1 className="mt-2 text-balance text-2xl font-semibold leading-tight text-ink sm:text-3xl">
                {content.title}
              </h1>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-muted sm:text-base">
                {content.body}
              </p>
              {content.extraLine ? (
                <p
                  className="mt-3 text-pretty text-sm leading-relaxed text-ink-faint sm:text-base"
                  style={{ opacity: extraLineOpacity }}
                >
                  {content.extraLine}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">
              {content.kicker}
            </p>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

export function TriangleScrollScene() {
  const sectionRef = useRef<HTMLElement>(null);
  const { triangleProgress, showcaseReveal, showcasePrimed } =
    useHeroSnapScroll(sectionRef);
  const uid = useId().replace(/:/g, "");
  const shineId = `${uid}-shine`;

  const { bands, totalH } = useMemo(() => layoutAlignedTriangle(), []);
  const topSlot = bands[0]!;
  const midSlot = bands[1]!;
  const botSlot = bands[2]!;

  const bottomPeakHeight = botSlot.s * BOTTOM_SCALE_STEP_2 * H;
  const anim = triangleAnimFromSectionProgress(
    triangleProgress,
    bottomPeakHeight,
    SCROLL_CYCLES,
  );

  const slots = slotContentsAtCycle(anim.cycleIndex);
  const topContent =
    slots[0] != null ? BLOCK_CONTENTS[slots[0]!]! : null;
  const midContent =
    slots[1] != null ? BLOCK_CONTENTS[slots[1]!]! : null;
  const botContent =
    slots[2] != null ? BLOCK_CONTENTS[slots[2]!]! : null;

  const bottomScale = botSlot.s * anim.bottomScaleFactor;
  const slotT = anim.slotShift;

  const topTransform =
    slotT > 0 && slots[0] != null
      ? bandTransformFromState(
          lerpBandTransformState(
            bandToTransformState(topSlot),
            bandToTransformState(midSlot),
            slotT,
          ),
        )
      : bandTransform(topSlot);

  const midTransform =
    slotT > 0 && slots[1] != null
      ? bandTransformFromState(
          lerpBandTransformState(
            bandToTransformState(midSlot),
            bandToTransformState(botSlot),
            slotT,
          ),
        )
      : bandTransform(midSlot);

  const triangleFade =
    showcaseReveal > 0 ? Math.max(0, 1 - showcaseReveal * 1.2) : 1;

  const SHOWCASE_ANCHOR_OFFSET_VB = 22;
  const anchorRatio = (botSlot.y - SHOWCASE_ANCHOR_OFFSET_VB) / totalH;
  const showcaseAnchorTopRem = 6 + anchorRatio * 28;

  return (
    <section
      ref={sectionRef}
      aria-label="TaseDeck path"
      className="relative w-full"
      style={{ height: `${SCENE_SCROLL_VH}vh` }}
    >
      <div className="sticky top-0 h-svh w-full overflow-visible px-4 sm:px-6 lg:px-8">
        <div className="relative mx-auto h-full w-full max-w-6xl">
          <div className="pt-24">
            <div
              className="relative mx-auto w-full max-w-[680px]"
              style={{ opacity: triangleFade }}
            >
              <svg
                viewBox={`0 0 ${W} ${totalH}`}
                className="block w-full overflow-visible"
                style={{ height: "auto", overflow: "visible" }}
                preserveAspectRatio="xMidYMin meet"
                role="img"
                aria-label="TaseDeck product path"
              >
                <defs>
                  <linearGradient
                    id={shineId}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="white" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {topContent ? (
                  <PathBlockGraphic
                    shineId={shineId}
                    content={topContent}
                    transform={topTransform}
                  />
                ) : null}

                {midContent ? (
                  <PathBlockGraphic
                    shineId={shineId}
                    content={midContent}
                    transform={midTransform}
                  />
                ) : null}

                {botContent ? (
                  <g transform={`translate(0 ${anim.bottomExitY})`}>
                    <PathBlockGraphic
                      shineId={shineId}
                      content={botContent}
                      transform={bandTransformGrowFromTop(botSlot, bottomScale)}
                      opacity={anim.bottomOpacity}
                      extraLineOpacity={anim.extraTextOpacity}
                    />
                  </g>
                ) : null}
              </svg>
            </div>
          </div>

          <AppShowcase
            reveal={showcaseReveal}
            primed={showcasePrimed}
            anchorTopRem={showcaseAnchorTopRem}
          />
        </div>
      </div>
    </section>
  );
}
