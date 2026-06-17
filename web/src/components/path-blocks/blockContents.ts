export type BlockContent = {
  id: string;
  kicker: string;
  title?: string;
  body?: string;
  extraLine?: string;
};

/** Slot indices: 0 = top, 1 = middle, 2 = bottom (front). `null` = empty / virtual. */
export type SlotContents = [number | null, number | null, number | null];

export const BLOCK_CONTENTS: BlockContent[] = [
  {
    id: "topology",
    kicker: "Topology",
  },
  {
    id: "installed",
    kicker: "Installed",
  },
  {
    id: "market",
    kicker: "Market",
    title: "Registry-first discovery",
    body: "Browse MCP servers, resolve installs, and open cards without losing context.",
    extraLine:
      "Install servers, wire agents, and ship MCP flows from one desktop shell.",
  },
];

/**
 * Bottom exits; top→mid, mid→bot. Top becomes empty — no wrap into a 4th visible block.
 */
export function shiftSlotContents(slots: SlotContents): SlotContents {
  const [top, mid] = slots;
  return [null, top, mid];
}

export function slotContentsAtCycle(cycle: number): SlotContents {
  let slots: SlotContents = [0, 1, 2];
  for (let i = 0; i < cycle; i++) {
    slots = shiftSlotContents(slots);
  }
  return slots;
}

export const SCROLL_CYCLES = 3;
