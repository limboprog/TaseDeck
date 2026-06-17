export const SHOWCASE_DEMO_VIDEO = "/mov/graph_window.mov";

export type ShowcaseScreen = {
  id: string;
  label: string;
  title: string;
  description: string;
  /** Placeholder gradient until real screenshots are added. */
  gradient: string;
  /** Optional demo video in public/. */
  videoSrc?: string;
};

export const SHOWCASE_SCREENS: ShowcaseScreen[] = [
  {
    id: "market",
    label: "Market",
    title: "MCP Registry",
    description: "Browse and install servers from the registry.",
    gradient: "linear-gradient(145deg, #1a1428 0%, #2d1f4e 45%, #1e1635 100%)",
    videoSrc: SHOWCASE_DEMO_VIDEO,
  },
  {
    id: "installed",
    label: "Installed",
    title: "Installed servers",
    description: "Configure env vars, run commands, and probe tools.",
    gradient: "linear-gradient(145deg, #121820 0%, #1e2a38 50%, #141c26 100%)",
    videoSrc: SHOWCASE_DEMO_VIDEO,
  },
  {
    id: "topology",
    label: "Topology",
    title: "Workspace graph",
    description: "Wire agents, MCP servers, and blocks on one canvas.",
    gradient: "linear-gradient(145deg, #141228 0%, #251a42 55%, #18132e 100%)",
    videoSrc: SHOWCASE_DEMO_VIDEO,
  },
  {
    id: "agents",
    label: "Agents",
    title: "Agent configs",
    description: "Manage Cursor and other agent MCP configurations.",
    gradient: "linear-gradient(145deg, #101418 0%, #1c2430 50%, #121820 100%)",
    videoSrc: SHOWCASE_DEMO_VIDEO,
  },
  {
    id: "workspace",
    label: "Workspace",
    title: "Split workspace",
    description: "Market, MCP, and topology side by side.",
    gradient: "linear-gradient(145deg, #18120f 0%, #2a1f18 50%, #1a1410 100%)",
    videoSrc: SHOWCASE_DEMO_VIDEO,
  },
];
