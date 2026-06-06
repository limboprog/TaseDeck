import type { ComponentProps, ReactNode } from "react";
import { GlassPanel } from "../../components/Glass/GlassPanel";

type McpPanelProps = ComponentProps<typeof GlassPanel> & {
  children: ReactNode;
};

/** MCP panels — follow global liquid glass preference via GlassPanel. */
export function McpPanel(props: McpPanelProps) {
  return <GlassPanel {...props} />;
}
