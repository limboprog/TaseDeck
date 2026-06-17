import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type GlassChipProps<T extends ElementType = "div"> = {
  children: ReactNode;
  className?: string;
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

export function GlassChip<T extends ElementType = "div">({
  children,
  className = "",
  as,
  ...props
}: GlassChipProps<T>) {
  const Tag = (as ?? "div") as ElementType;

  return (
    <Tag
      className={`relative overflow-hidden rounded-lg border border-glass-border bg-glass-fill-dense shadow-glass backdrop-blur-2xl backdrop-saturate-150 ${className}`}
      {...props}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent"
      />
      <span className="relative z-10 flex h-full w-full items-center justify-center">
        {children}
      </span>
    </Tag>
  );
}
