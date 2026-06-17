"use client";

import { useState } from "react";
import { LiquidGlass } from "@/components/liquid-glass";
import { SHOWCASE_SCREENS } from "./showcaseScreens";

const DOT_PX = 10;

/** ~1rem air below sticky nav when panel is open. */
const PANEL_TOP_REM = 7;
const PANEL_BOTTOM_REM = 1;

type AppShowcaseProps = {
  reveal: number;
  primed: boolean;
  /** Seed dot position (rem from viewport top). */
  anchorTopRem: number;
};

export function AppShowcase({ reveal, primed, anchorTopRem }: AppShowcaseProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!primed) {
    return null;
  }

  const active = SHOWCASE_SCREENS[activeIndex]!;
  const eased = 1 - (1 - reveal) ** 3;
  const isDot = eased < 0.04;
  const interactive = eased > 0.55;

  const openHeight = `calc(100svh - ${PANEL_TOP_REM + PANEL_BOTTOM_REM}rem)`;

  const top = isDot
    ? `${anchorTopRem}rem`
    : `calc(${anchorTopRem * (1 - eased)}rem + ${PANEL_TOP_REM * eased}rem)`;

  const width = isDot
    ? DOT_PX
    : eased >= 0.98
      ? "min(72rem, 100vw - 2rem)"
      : `calc(min(72rem, 100vw - 2rem) * ${0.15 + eased * 0.85})`;

  const height =
    isDot
      ? DOT_PX
      : eased >= 0.98
        ? openHeight
        : `calc(${openHeight} * ${eased})`;

  return (
    <div
      className="absolute left-1/2 z-30 -translate-x-1/2"
      style={{
        top,
        width,
        height,
        transformOrigin: "top center",
        pointerEvents: interactive ? "auto" : "none",
      }}
      aria-hidden={isDot}
    >
      {isDot ? (
        <div
          className="h-full w-full rounded-full border border-accent/40 bg-accent/80 shadow-[0_0_18px_rgba(139,92,246,0.55)]"
          aria-hidden
        />
      ) : (
        <LiquidGlass className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
            <div
              className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-white/[0.08]"
              style={{ background: active.gradient }}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(139,92,246,0.18),transparent_55%)]" />
              <div className="relative flex min-h-0 flex-1 flex-col p-4 sm:p-6">
                <div className="shrink-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                    {active.label}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-ink sm:text-2xl">
                    {active.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                    {active.description}
                  </p>
                </div>

                <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-xl border border-white/[0.1] bg-black/30 backdrop-blur-sm sm:mt-4">
                  <div className="flex h-full min-h-[140px] items-center justify-center text-sm text-ink-faint">
                    App screenshot · {active.label}
                  </div>
                </div>
              </div>
            </div>

            <div
              className="flex shrink-0 gap-2"
              role="tablist"
              aria-label="App screens"
            >
              {SHOWCASE_SCREENS.map((screen, index) => {
                const selected = index === activeIndex;

                return (
                  <button
                    key={screen.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    disabled={!interactive}
                    onClick={() => setActiveIndex(index)}
                    className={`flex-1 rounded-pill border px-2 py-2.5 text-center text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                      selected
                        ? "border-accent/50 bg-accent/15 text-ink"
                        : "border-white/[0.08] bg-white/[0.04] text-ink-muted hover:bg-white/[0.08] hover:text-ink"
                    } disabled:cursor-default disabled:opacity-60`}
                  >
                    {screen.label}
                  </button>
                );
              })}
            </div>
          </div>
        </LiquidGlass>
      )}
    </div>
  );
}
