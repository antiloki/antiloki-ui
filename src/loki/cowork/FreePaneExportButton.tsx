// THE EXPORT OF A FREE PANE, AS A SMALL ICON ON THE PANE'S TOP BAR (operator 2026-11-25: "an icon on the top bar, discreet"). It used to be a text button inside the pane.
import * as React from "react";
import { C } from "@/loki/theme";
import { exportFreePane } from "./free-pane-export";

export function FreePaneExportButton({ id }: { id: string }) {
  const [err, setErr] = React.useState("");
  return (
    <button data-testid="pane-export" aria-label="export this pane" title={err || "Save this pane as one file (never its approval or its memory)"}
      onClick={() => { void exportFreePane(id).then((r) => setErr(r.ok ? "" : r.error ?? "could not export")); }}
      style={{ background: "transparent", border: "none", cursor: "pointer", color: err ? C.bad : C.muted, padding: "0 4px", display: "inline-flex", alignItems: "center", height: 20 }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 2v8M5 7l3 3 3-3M3 13h10" /></svg>
    </button>
  );
}
