import type { CSSProperties, ReactNode, Ref } from "react";
import { Text, XStack, YStack } from "tamagui";
import { colors } from "../../theme";
import { ToolbarChevron } from "./ToolbarChevron";

type ToolbarCollapsibleProps = {
  title: string;
  count?: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: ReactNode;
  sectionRef?: Ref<HTMLDivElement>;
  headerStyle?: CSSProperties;
  stickyHeader?: boolean;
  bodyGap?: number;
  bodyPaddingTop?: number;
  disableTransition?: boolean;
};

export function ToolbarCollapsible({
  title,
  count,
  expanded,
  onExpandedChange,
  children,
  sectionRef,
  headerStyle,
  stickyHeader = true,
  bodyGap = 8,
  bodyPaddingTop = 8,
  disableTransition = false,
}: ToolbarCollapsibleProps) {
  return (
    <div ref={sectionRef} style={{ width: "100%" }}>
      <XStack
        className={stickyHeader ? "mcp-list-section-header" : undefined}
        items="center"
        gap={6}
        px={2}
        py={2}
        cursor="pointer"
        onPress={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
        style={headerStyle}
      >
        <XStack width={14} items="center" justify="center" shrink={0}>
          <ToolbarChevron expanded={expanded} size={12} variant="disclosure" />
        </XStack>
        <Text color={colors.muted} fontSize={11} fontWeight="600" select="none">
          {title}
        </Text>
        {count != null ? (
          <XStack
            minW={18}
            height={18}
            px={count > 9 ? 5 : 0}
            width={count > 9 ? undefined : 18}
            rounded={999}
            bg={colors.accent}
            items="center"
            justify="center"
            shrink={0}
          >
            <Text color="#fff" fontSize={10} fontWeight="700" lineHeight={12} select="none">
              {count > 99 ? "99+" : count}
            </Text>
          </XStack>
        ) : null}
      </XStack>

      <div
        className="mcp-list-collapsible-body"
        data-expanded={expanded ? "true" : "false"}
        data-animate={disableTransition ? "false" : "true"}
      >
        <div className="mcp-list-collapsible-inner">
          <YStack gap={bodyGap} pt={bodyPaddingTop}>
            {children}
          </YStack>
        </div>
      </div>
    </div>
  );
}
