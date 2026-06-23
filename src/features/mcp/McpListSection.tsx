import type { CSSProperties, ReactNode, Ref } from "react";
import { colors } from "../../theme";
import { MCP_LIST_SECTION_HEADER_Z_INDEX } from "./mcpScrollLayout";
import { ToolbarCollapsible } from "../../components/pane";

type McpListCollapsibleSectionProps = {
  title: string;
  count?: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  sectionRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  headerStyle?: CSSProperties;
  bodyPaddingTop?: number;
};

export function McpListCollapsibleSection({
  title,
  count,
  expanded,
  onExpandedChange,
  sectionRef,
  children,
  headerStyle,
  bodyPaddingTop = 8,
}: McpListCollapsibleSectionProps) {
  return (
    <ToolbarCollapsible
      title={title}
      count={count}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      sectionRef={sectionRef}
      stickyHeader
      bodyPaddingTop={bodyPaddingTop}
      bodyGap={8}
      headerStyle={{
        top: 0,
        zIndex: MCP_LIST_SECTION_HEADER_Z_INDEX,
        background: headerStyle?.background ?? colors.surface,
        ...headerStyle,
      }}
    >
      {children}
    </ToolbarCollapsible>
  );
}
