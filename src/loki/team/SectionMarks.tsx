// THE DRAWINGS OF A NODE'S PARTS (the operator 2026-11-18: "the icons should be better, grouped and organised like the graph"): the same stroke family as the graph's glyphs (rounded, 1.5 wide, one accent), one drawing per part of a node, centred on (0, 0) in a box 24 across.
import * as React from "react";
import { C } from "@/loki/theme";

export type PartKey = "model" | "cap" | "out" | "trail" | "auto" | "tools" | "brief" | "ctx" | "chain" | "delivered";
const st = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
/** One part, drawn in `color` (its accent) with the quiet grey for the body. */
export function SectionMark({ k, color, size = 22 }: { k: PartKey; color: string; size?: number }) {
  const m = C.muted; const sw = 1.5;
  const body = (() => {
    switch (k) {
      case "model": return <><rect x={-6.5} y={-6.5} width={13} height={13} rx={3} stroke={m} strokeWidth={sw} {...st} /><rect x={-2.6} y={-2.6} width={5.2} height={5.2} rx={1.2} fill={color} /><path d="M-3 -10V-6.5M3 -10V-6.5M-3 6.5V10M3 6.5V10M-10 -3H-6.5M-10 3H-6.5M6.5 -3H10M6.5 3H10" stroke={m} strokeWidth={1.2} {...st} /></>;
      case "cap": return <><circle r={8.5} stroke={m} strokeWidth={sw} {...st} /><path d="M-4.2 3.4 C-1 5.2 3.8 4.4 3.8 1.6 C3.8 -1.4 -3.8 -0.6 -3.8 -3.6 C-3.8 -6.2 1.4 -6.4 4 -4.4 M0 -8V8" stroke={color} strokeWidth={1.4} {...st} /></>;
      case "out": return <><path d="M-6 -9H2L7 -4V9H-6Z" stroke={m} strokeWidth={sw} {...st} /><path d="M2 -9V-4H7" stroke={m} strokeWidth={1.3} {...st} /><path d="M-3 1H4M-3 4.5H2" stroke={color} strokeWidth={1.5} {...st} /></>;
      case "delivered": return <><rect x={-9} y={-6.5} width={18} height={13} rx={3} stroke={m} strokeWidth={sw} {...st} /><path d="M-2.4 -3V3L3.4 0Z" fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" /></>;
      case "trail": return <><path d="M-6 -8V8" stroke={m} strokeWidth={1.2} {...st} /><circle cx={-6} cy={-6} r={2} fill={color} /><circle cx={-6} cy={0} r={2} stroke={color} strokeWidth={1.4} fill="none" /><circle cx={-6} cy={6} r={2} stroke={m} strokeWidth={1.4} fill="none" /><path d="M-1.5 -6H8M-1.5 0H6M-1.5 6H8" stroke={m} strokeWidth={1.4} {...st} /></>;
      case "auto": return <><path d="M-8.5 5A9.5 9.5 0 1 1 8.5 5" stroke={m} strokeWidth={sw} {...st} /><path d="M0 4L4.8 -3.4" stroke={color} strokeWidth={1.8} {...st} /><circle cy={4} r={1.8} fill={color} /></>;
      case "tools": return <><path d="M-3 -9V-3M3 -9V-3M-6 -3H6V1C6 4.5 3.5 7 0 7C-3.5 7 -6 4.5 -6 1ZM0 7V10" stroke={m} strokeWidth={sw} {...st} /><circle cx={0} cy={-3} r={1.4} fill={color} /></>;
      case "brief": return <><path d="M-7 -8H5C7 -8 7 -5.5 7 -5V8H-4C-6 8 -7 6.5 -7 5Z" stroke={m} strokeWidth={sw} {...st} /><path d="M-3.5 -3H3M-3.5 0.5H3M-3.5 4H0" stroke={color} strokeWidth={1.4} {...st} /></>;
      case "ctx": return <><path d="M0 -9L9 -4.5L0 0L-9 -4.5Z" stroke={color} strokeWidth={sw} {...st} /><path d="M-9 0L0 4.5L9 0M-9 4.5L0 9L9 4.5" stroke={m} strokeWidth={sw} {...st} /></>;
      case "chain": return <><path d="M0 -9L8 -6V1C8 5 4 8 0 9.5C-4 8 -8 5 -8 1V-6Z" stroke={m} strokeWidth={sw} {...st} /><path d="M-3.4 0.5L-0.8 3.2L3.8 -2.4" stroke={color} strokeWidth={1.6} {...st} /></>;
    }
  })();
  return <svg viewBox="-12 -12 24 24" width={size} height={size} aria-hidden>{body}</svg>;
}
