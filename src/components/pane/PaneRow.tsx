import type { ReactNode } from "react";
import { XStack } from "tamagui";
import { borders, colors, surfaces } from "../../theme";
import { ToolbarChevron } from "../toolbar/ToolbarChevron";
import { McpPanel } from "../../features/mcp/McpPanel";
import { PaneEllipsis } from "./PaneExpandableText";
import { PANE_ROW_MIN_HEIGHT, PANE_ROW_PADDING, PANE_ROW_RADIUS } from "./paneStyles";

type PaneRowProps = {
  title: string;
  selected?: boolean;
  accentBorder?: boolean;
  onPress?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  expandedContent?: ReactNode;
  titleFontSize?: number;
  titleFontWeight?: number;
};

export function PaneRow({
  title,
  selected = false,
  accentBorder = false,
  onPress,
  leading,
  trailing,
  expandable = false,
  expanded = false,
  onToggleExpand,
  expandedContent,
  titleFontSize = 14,
  titleFontWeight,
}: PaneRowProps) {
  const resolvedWeight = titleFontWeight ?? (selected ? 600 : 500);
  const handlePress = expandable ? onToggleExpand : onPress;

  return (
    <div
      className={accentBorder ? "pane-row--accent" : undefined}
      style={{
        position: "relative",
        width: "100%",
        borderRadius: PANE_ROW_RADIUS,
      }}
    >
      <McpPanel
        className={
          selected ? "mcp-list-card-shell mcp-list-card-shell--selected" : "mcp-list-card-shell"
        }
        p={PANE_ROW_PADDING}
        cursor={handlePress ? "pointer" : "default"}
        rounded={PANE_ROW_RADIUS}
        borderWidth={1}
        borderColor={
          accentBorder
            ? (colors.success as never)
            : selected
              ? (borders.default as never)
              : undefined
        }
        bg={selected ? surfaces.subtle : undefined}
        onPress={handlePress}
        hoverStyle={{
          borderColor: accentBorder ? (colors.success as never) : borders.default,
          bg: surfaces.subtle,
        }}
        focusWithinStyle={{
          borderColor: accentBorder ? (colors.success as never) : borders.default,
          bg: surfaces.subtle,
        }}
      >
        <XStack width="100%" items="center" justify="space-between" gap={12} minH={PANE_ROW_MIN_HEIGHT}>
          <XStack flex={1} items="center" gap={8} minW={0}>
            {expandable ? (
              <XStack width={14} items="center" justify="center" shrink={0}>
                <ToolbarChevron expanded={expanded} size={12} variant="disclosure" />
              </XStack>
            ) : (
              leading
            )}
            <PaneEllipsis
              style={{
                color: colors.foreground,
                fontSize: titleFontSize,
                fontWeight: resolvedWeight,
                userSelect: "none",
              }}
            >
              {title}
            </PaneEllipsis>
          </XStack>
          {trailing ? (
            <XStack
              items="center"
              gap={6}
              shrink={0}
              height={PANE_ROW_MIN_HEIGHT}
              onPress={(event) => event.stopPropagation()}
            >
              {trailing}
            </XStack>
          ) : null}
        </XStack>

        {expandable && expandedContent ? (
          <div
            className="mcp-list-collapsible-body"
            data-expanded={expanded ? "true" : "false"}
          >
            <div className="mcp-list-collapsible-inner">{expandedContent}</div>
          </div>
        ) : null}
      </McpPanel>
    </div>
  );
}
