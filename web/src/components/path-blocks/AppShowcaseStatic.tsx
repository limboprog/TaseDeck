"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GlassChip, LiquidGlass } from "@/components/liquid-glass";
import { SHOWCASE_DEMO_VIDEO, SHOWCASE_SCREENS } from "./showcaseScreens";

const PANEL_BOTTOM_REM = 1;
const SHOWCASE_INNER_BG = "/img/Fx6_OZuWwAIEsYe.jpg";
const SLIDE_MS = 580;
const SLIDE_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const TAB_LIFT_PX = 10;

type AppShowcaseStaticProps = {
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
};

export function AppShowcaseStatic({
  activeIndex: controlledIndex,
  onActiveIndexChange,
}: AppShowcaseStaticProps = {}) {
  const [internalIndex, setInternalIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const activeIndex = controlledIndex ?? internalIndex;
  const emphasizedIndex = hoveredIndex ?? activeIndex;
  const slideCount = SHOWCASE_SCREENS.length;
  const slideStep = 100 / slideCount;

  const setActiveIndex = (index: number) => {
    if (index === activeIndex) return;
    onActiveIndexChange?.(index);
    if (controlledIndex === undefined) {
      setInternalIndex(index);
    }
  };

  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index === activeIndex) {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [activeIndex]);

  return (
    <div
      className="h-full min-h-[280px]"
      style={{ height: `calc(100% - ${PANEL_BOTTOM_REM}rem)` }}
      aria-label="TaseDeck app preview"
    >
      <LiquidGlass density="dense" className="flex h-full min-h-0 flex-col overflow-hidden p-2.5 sm:p-3">
        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-visible rounded-[14px] border border-glass-border bg-cover bg-center bg-no-repeat px-3 py-4 sm:px-4 sm:py-5"
          style={{ backgroundImage: `url(${SHOWCASE_INNER_BG})` }}
        >
          <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-[inherit]">
            <div
              className="flex h-full will-change-transform"
              style={{
                width: `${slideCount * 100}%`,
                transform: `translate3d(-${activeIndex * slideStep}%, 0, 0)`,
                transition: `transform ${SLIDE_MS}ms ${SLIDE_EASING}`,
              }}
            >
              {SHOWCASE_SCREENS.map((screen, index) => {
                const isActive = index === activeIndex;

                return (
                  <div
                    key={screen.id}
                    className="flex h-full items-center justify-center"
                    style={{ width: `${slideStep}%` }}
                    aria-hidden={!isActive}
                  >
                    <video
                      ref={(node) => {
                        videoRefs.current[index] = node;
                      }}
                      className="max-h-full max-w-full rounded-2xl border border-glass-border bg-black/20 shadow-[0_18px_48px_rgba(0,0,0,0.42)]"
                      playsInline
                      autoPlay={isActive}
                      loop
                      muted
                      preload={isActive ? "auto" : "metadata"}
                      aria-label={`${screen.label} demo`}
                      aria-hidden={!isActive}
                    >
                      <source src={SHOWCASE_DEMO_VIDEO} type="video/quicktime" />
                      <source src={SHOWCASE_DEMO_VIDEO} />
                    </video>
                  </div>
                );
              })}
            </div>

          </div>

          <div className="relative z-20 mt-auto flex justify-center pb-0.5 pt-5">
            <LiquidGlass
              density="dense"
              className="relative h-auto shrink-0 !overflow-visible !rounded-xl [&>div:last-child]:h-auto"
            >
              <div className="h-2 px-3 sm:px-3.5" aria-hidden />
              <div
                className="absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-1/2 gap-1.5 sm:gap-2"
                role="tablist"
                aria-label="App screens"
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {SHOWCASE_SCREENS.map((screen, index) => {
                  const selected = index === activeIndex;
                  const emphasized = index === emphasizedIndex;

                  return (
                    <div
                      key={screen.id}
                      className="relative"
                      onMouseEnter={() => setHoveredIndex(index)}
                    >
                      <span
                        className={`pointer-events-none absolute bottom-[calc(100%+0.35rem)] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md border border-glass-border bg-glass-fill-dense px-2 py-1 text-[11px] font-medium text-ink shadow-glass backdrop-blur-2xl transition-[opacity,transform] duration-200 ${
                          emphasized
                            ? "translate-y-0 opacity-100"
                            : "translate-y-1 opacity-0"
                        }`}
                        aria-hidden={!emphasized}
                      >
                        {screen.label}
                      </span>

                      <GlassChip
                        as="button"
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-label={screen.label}
                        onClick={() => setActiveIndex(index)}
                        style={
                          {
                            transform: emphasized
                              ? `translateY(-${TAB_LIFT_PX}px)`
                              : "translateY(0)",
                            transformOrigin: "50% 100%",
                            zIndex: emphasized ? 10 : 1,
                          } as CSSProperties
                        }
                        className={`h-9 w-9 text-[11px] font-semibold uppercase leading-none transition-[transform,color,box-shadow] duration-250 ease-out ${
                          emphasized
                            ? "text-ink shadow-[0_8px_20px_rgba(0,0,0,0.28)]"
                            : "text-ink-muted"
                        }`}
                      >
                        {screen.label.slice(0, 1)}
                      </GlassChip>
                    </div>
                  );
                })}
              </div>
            </LiquidGlass>
          </div>
        </div>
      </LiquidGlass>
    </div>
  );
}
