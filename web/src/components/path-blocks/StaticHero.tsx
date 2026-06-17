"use client";

import { PAGE_CONTAINER_CLASS } from "@/styles/pageLayout";
import { AppShowcaseStatic } from "./AppShowcaseStatic";

const PANEL_TOP_REM = 7;
const PANEL_BOTTOM_REM = 1;

export function StaticHero() {
  return (
    <section
      aria-label="TaseDeck hero"
      className={`${PAGE_CONTAINER_CLASS} pt-28`}
    >
      <div
        className="min-h-[calc(100svh-8rem)]"
        style={{ height: `calc(100svh - ${PANEL_TOP_REM + PANEL_BOTTOM_REM}rem)` }}
      >
        <AppShowcaseStatic />
      </div>
    </section>
  );
}
