import type { CSSProperties, ReactNode } from "react";
import { YStack, type YStackProps } from "tamagui";

type PaneViewProps = {
  toolbar?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  gap?: number;
  contentStyle?: CSSProperties;
} & Pick<YStackProps, "flex" | "minH" | "minW" | "overflow" | "bg" | "px" | "py" | "pt" | "pb" | "pl" | "pr">;

/** Shared tab pane shell: optional toolbar, header, scrollable body, footer. Used in Usage and Topology. */
export function PaneView({
  toolbar,
  header,
  footer,
  children,
  gap = 12,
  contentStyle,
  ...stackProps
}: PaneViewProps) {
  return (
    <YStack gap={gap} minH={0} minW={0} overflow="hidden" {...stackProps}>
      {toolbar}
      {header}
      <div
        style={{
          flex: stackProps.flex === 1 ? 1 : undefined,
          minHeight: 0,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          ...contentStyle,
        }}
      >
        {children}
      </div>
      {footer}
    </YStack>
  );
}
