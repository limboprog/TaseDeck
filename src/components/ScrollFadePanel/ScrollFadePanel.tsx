import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { colors } from "../../theme";

type ScrollFadePanelProps = {
  header?: ReactNode;
  children: ReactNode;
  /** Height of the fade strip between header and list (px). */
  fadeHeight?: number;
  /** Scroll distance (px) until fade reaches full strength. */
  fadeDistance?: number;
  contentPadding?: string;
  /** Restore and persist vertical scroll for the session. */
  initialScrollTop?: number;
  onScrollTopChange?: (scrollTop: number) => void;
};

export function ScrollFadePanel({
  header,
  children,
  fadeHeight = 48,
  fadeDistance = 56,
  contentPadding = "16px",
  initialScrollTop = 0,
  onScrollTopChange,
}: ScrollFadePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fadeOpacity, setFadeOpacity] = useState(0);
  const restoredScrollRef = useRef(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || restoredScrollRef.current || initialScrollTop <= 0) {
      return;
    }
    node.scrollTop = initialScrollTop;
    restoredScrollRef.current = true;
    const next = Math.min(1, node.scrollTop / fadeDistance);
    setFadeOpacity(next);
  }, [fadeDistance, initialScrollTop]);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    onScrollTopChange?.(node.scrollTop);
    const next = Math.min(1, node.scrollTop / fadeDistance);
    setFadeOpacity((current) => (Math.abs(current - next) < 0.02 ? current : next));
  }, [fadeDistance, onScrollTopChange]);

  const fadeStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: fadeHeight,
    pointerEvents: "none",
    zIndex: 2,
    opacity: fadeOpacity,
    background: `linear-gradient(to bottom, ${colors.surface} 0%, transparent 100%)`,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {header != null ? (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 3,
            flexShrink: 0,
            background: colors.surface,
            padding: contentPadding,
            paddingBottom: 12,
          }}
        >
          {header}
        </div>
      ) : null}

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <div style={fadeStyle} aria-hidden />
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            height: "100%",
            minHeight: 0,
            overflow: "auto",
            width: "100%",
          }}
        >
          <div
            style={{
              padding: contentPadding,
              paddingTop: 4,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
