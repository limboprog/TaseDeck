"use client";

import { useId, useMemo, useState } from "react";
import { BLOCK_CONTENTS } from "./blockContents";
import { PATH_SHAPE_D, PATH_TOP_CENTER_X, PATH_VIEWBOX } from "./pathShape";
import {
  bandTransform,
  layoutAlignedTriangle,
  type TriangleBand,
} from "./triangleLayout";

const HOVER_SCALE = 1.14;
const HOVER_SHIFT_X = -32;

const PATH_BLOCK_IDS = ["topology", "installed", "market"] as const;

export type PathBlockId = (typeof PATH_BLOCK_IDS)[number];

export const PATH_BLOCK_TO_SHOWCASE_INDEX: Record<PathBlockId, number> = {
  topology: 2,
  installed: 1,
  market: 0,
};

type PathBlocksPickerProps = {
  activeId?: PathBlockId;
  onSelect?: (id: PathBlockId) => void;
};

function hoverTransform(band: TriangleBand, hovered: boolean) {
  const cx = band.tx + band.s * PATH_TOP_CENTER_X;
  const cy = band.y;
  const scale = hovered ? band.s * HOVER_SCALE : band.s;
  const shiftX = hovered ? HOVER_SHIFT_X * band.s : 0;

  if (!hovered) {
    return bandTransform(band);
  }

  return `translate(${cx + shiftX} ${cy}) scale(${scale}) translate(${-PATH_TOP_CENTER_X} 0)`;
}

type PathBlockGraphicProps = {
  shineId: string;
  band: TriangleBand;
  contentIndex: number;
  hovered: boolean;
  active: boolean;
  onHover: (hovered: boolean) => void;
  onSelect: () => void;
};

function PathBlockGraphic({
  shineId,
  band,
  contentIndex,
  hovered,
  active,
  onHover,
  onSelect,
}: PathBlockGraphicProps) {
  const content = BLOCK_CONTENTS[contentIndex]!;

  return (
    <g
      className="cursor-pointer outline-none"
      transform={hoverTransform(band, hovered)}
      style={{
        transition: "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={content.kicker}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <path
        d={PATH_SHAPE_D}
        fill="var(--color-glass-fill)"
        stroke={
          active
            ? "color-mix(in srgb, var(--color-accent) 55%, var(--color-glass-border))"
            : "var(--color-glass-border)"
        }
        strokeWidth={hovered || active ? 2 : 1.5}
        vectorEffect="non-scaling-stroke"
      />
      <path d={PATH_SHAPE_D} fill={`url(#${shineId})`} stroke="none" pointerEvents="none" />

      <foreignObject x="70" y="210" width="636" height="175" pointerEvents="none">
        <div className="flex h-full flex-col justify-end pb-6">
          {content.title ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent sm:text-sm">
                {content.kicker}
              </p>
              <h2 className="mt-2 text-balance text-2xl font-semibold leading-tight text-ink sm:text-3xl">
                {content.title}
              </h2>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-muted sm:text-base">
                {content.body}
              </p>
            </>
          ) : (
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-faint sm:text-sm">
              {content.kicker}
            </p>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

export function PathBlocksPicker({ activeId, onSelect }: PathBlocksPickerProps) {
  const [hoveredId, setHoveredId] = useState<PathBlockId | null>(null);
  const uid = useId().replace(/:/g, "");
  const shineId = `${uid}-path-shine`;

  const { bands, totalH } = useMemo(() => layoutAlignedTriangle(), []);
  const W = PATH_VIEWBOX.width;

  const renderOrder = useMemo(() => {
    return [...PATH_BLOCK_IDS].sort((a, b) => {
      if (hoveredId === a) return 1;
      if (hoveredId === b) return -1;
      return PATH_BLOCK_IDS.indexOf(a) - PATH_BLOCK_IDS.indexOf(b);
    });
  }, [hoveredId]);

  const bandById: Record<PathBlockId, TriangleBand> = {
    topology: bands[0]!,
    installed: bands[1]!,
    market: bands[2]!,
  };

  return (
    <div className="mx-auto w-full max-w-[680px]" aria-label="Product path">
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        className="block w-full overflow-visible"
        style={{ height: "auto", overflow: "visible" }}
        preserveAspectRatio="xMidYMin meet"
        role="img"
      >
        <defs>
          <linearGradient id={shineId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="0.05" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {renderOrder.map((id) => {
          const band = bandById[id];
          const contentIndex = PATH_BLOCK_IDS.indexOf(id);

          return (
            <PathBlockGraphic
              key={id}
              shineId={shineId}
              band={band}
              contentIndex={contentIndex}
              hovered={hoveredId === id}
              active={activeId === id}
              onHover={(hovered) => setHoveredId(hovered ? id : null)}
              onSelect={() => onSelect?.(id)}
            />
          );
        })}
      </svg>
    </div>
  );
}
