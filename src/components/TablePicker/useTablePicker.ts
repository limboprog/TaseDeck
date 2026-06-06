import { useCallback, useEffect, useState, type RefObject } from "react";
import type { TablePickerAnchor } from "./types";

function isPickerTarget(target: Node) {
  return target instanceof Element && Boolean(target.closest("[data-table-picker]"));
}

export function useTablePicker(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  onOpenChange: (open: boolean) => void,
  dismissRef?: RefObject<HTMLElement | null>,
) {
  const dismissTarget = dismissRef ?? anchorRef;
  const [anchor, setAnchor] = useState<TablePickerAnchor | null>(null);

  const measureAnchor = useCallback(() => {
    const node = anchorRef.current;
    if (!node) {
      return;
    }
    const rect = node.getBoundingClientRect();
    setAnchor({
      left: rect.left,
      top: rect.bottom,
      width: rect.width,
    });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    measureAnchor();
    window.addEventListener("scroll", measureAnchor, true);
    window.addEventListener("resize", measureAnchor);
    return () => {
      window.removeEventListener("scroll", measureAnchor, true);
      window.removeEventListener("resize", measureAnchor);
    };
  }, [open, measureAnchor]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dismissTarget.current?.contains(target) || isPickerTarget(target)) {
        return;
      }
      onOpenChange(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [dismissTarget, onOpenChange, open]);

  return { anchor, measureAnchor };
}
