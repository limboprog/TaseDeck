import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from "react";
import {
  MCP_LIST_SCROLL_CLIP_Z_INDEX,
  MCP_LIST_STICKY_TOP,
} from "../../features/mcp/mcpScrollLayout";
import { layoutClasses, mergeLayoutClass } from "../../styles/layout";
import { colors } from "../../theme";

type ScrollFadePanelProps = {
  header?: ReactNode;
  children: ReactNode;
  contentPadding?: string;
  contentGap?: number;
  headerPaddingBottom?: number;
  /** Restore and persist vertical scroll for the session. */
  initialScrollTop?: number;
  onScrollTopChange?: (scrollTop: number) => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
};

export function ScrollFadePanel({
  header,
  children,
  contentPadding = "16px",
  contentGap = 12,
  headerPaddingBottom = 12,
  initialScrollTop = 0,
  onScrollTopChange,
  scrollRef,
}: ScrollFadePanelProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null);

  const setScrollNode = useCallback(
    (node: HTMLDivElement | null) => {
      internalScrollRef.current = node;
      if (scrollRef) {
        scrollRef.current = node;
      }
    },
    [scrollRef],
  );
  const restoredScrollRef = useRef(false);

  useEffect(() => {
    const node = internalScrollRef.current;
    if (!node || restoredScrollRef.current || initialScrollTop <= 0) {
      return;
    }
    node.scrollTop = initialScrollTop;
    restoredScrollRef.current = true;
  }, [initialScrollTop]);

  const handleScroll = useCallback(() => {
    const node = internalScrollRef.current;
    if (!node) {
      return;
    }
    onScrollTopChange?.(node.scrollTop);
  }, [onScrollTopChange]);

  return (
    <div className={mergeLayoutClass(layoutClasses.stack, layoutClasses.clip)} style={{ flex: 1 }}>
      {header != null ? (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 3,
            flexShrink: 0,
            background: colors.surface,
            padding: contentPadding,
            paddingBottom: headerPaddingBottom,
          }}
        >
          {header}
        </div>
      ) : null}

      <div className={layoutClasses.clip} style={{ position: "relative", flex: 1 }}>
        <div
          ref={setScrollNode}
          className={layoutClasses.scrollY}
          onScroll={handleScroll}
          style={{
            height: "100%",
            width: "100%",
            overflowAnchor: "none",
          }}
        >
          <div
            style={{
              padding: contentPadding,
              paddingTop: MCP_LIST_STICKY_TOP,
              display: "flex",
              flexDirection: "column",
              gap: contentGap,
              position: "relative",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "sticky",
                top: MCP_LIST_STICKY_TOP,
                zIndex: MCP_LIST_SCROLL_CLIP_Z_INDEX,
                height: 0,
                margin: 0,
                pointerEvents: "none",
                boxShadow: `0 -100vh 0 100vh ${colors.surface}`,
              }}
            />
            <div
              style={{
                position: "relative",
                zIndex: MCP_LIST_SCROLL_CLIP_Z_INDEX + 1,
                display: "flex",
                flexDirection: "column",
                gap: contentGap,
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
