import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type LiquidGlassDensity = "default" | "dense";

type LiquidGlassProps<T extends ElementType = "div"> = {
  children: ReactNode;
  className?: string;
  as?: T;
  density?: LiquidGlassDensity;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

const densityClasses: Record<LiquidGlassDensity, string> = {
  default: "border-glass-border bg-glass-fill backdrop-blur-xl",
  dense: "border-glass-border bg-glass-fill-dense backdrop-blur-2xl",
};

export function LiquidGlass<T extends ElementType = "div">({
  children,
  className = "",
  as,
  density = "default",
  ...props
}: LiquidGlassProps<T>) {
  const Tag = (as ?? "div") as ElementType;

  return (
    <Tag
      className={`relative overflow-hidden rounded-glass border border-glass-border shadow-glass backdrop-saturate-150 ${densityClasses[density]} ${className}`}
      {...props}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent"
      />
      <div className="relative z-10 h-full min-h-0 flex flex-col">{children}</div>
    </Tag>
  );
}
