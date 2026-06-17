"use client";

import { HERO_SCROLL_ANIMATION_ENABLED } from "./heroConfig";
import { StaticHero } from "./StaticHero";
import { TriangleScrollScene } from "./TriangleScrollScene";

export function HeroSection() {
  if (HERO_SCROLL_ANIMATION_ENABLED) {
    return <TriangleScrollScene />;
  }

  return <StaticHero />;
}
