// COMMIT, AND COMMIT AND PUSH, FROM THE STRIP (RFC 0007 §5.6). The same preview and the same endpoint the chat's "commit & push" button uses
// (`cockpit/agent/ship`): opening this only reads the box; the two buttons are the acts. A push is outward-facing, so it is its own button and says so.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { fetchShipPreview, shipChoice, shipNote, type ShipPreview, type ShipResult } from "@/loki/cockpit/commit-push-button";
import { apiPostStrict, reasonOf } from "@/loki/api/post-strict";

export function ShipPopover({ paneId, onClose, onNote }: { paneId: number; onClose: () => void; onNote: (text: string, bad?: boolean) => void }) {
  const [pv, setPv] = React.useState<ShipPreview | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { let live = true; void fetchShipPreview(paneId).then((p) => { if (live) setPv(p); }); return () => { live = false; }; }, [paneId]);
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const ch = shipChoice(pv);
  const act = async (push: boolean) => {
    setBusy(true);
    try {
      const r = await apiPostStrict<ShipResult>("/api/v1/cockpit/agent/ship", { pane_id: paneId, push });
      const bad = !r.ok || !!r.error || !!r.push_error;
      onNote(shipNote(r as ShipResult), bad);
    } catch (e) { onNote(`could not commit - ${reasonOf(e)}`, true); }
    finally { setBusy(false); onClose(); }
  };
  const btn = (on: boolean): React.CSSProperties => ({ fontFamily: nav, fontSize: 12, padding: "5px 12px", borderRadius: 6, border: `1px solid ${on ? C.brand : C.border}`, background: on ? `color-mix(in oklab, ${C.brand} 22%, ${C.panel2})` : C.panel2, color: on ? C.fg : C.muted, cursor: on && !busy ? "pointer" : "default" });
  return (
    <>
      <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
      <div role="dialog" aria-label="commit and push" data-testid="ship-popover" style={{ position: "absolute", left: 10, bottom: 36, zIndex: 999, width: 340, padding: 12, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 16px 40px -12px rgba(0,0,0,.6)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div data-testid="ship-summary" style={{ fontFamily: mono, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{pv?.why ? pv.why : pv ? `${pv.branch || "this box"} · ${ch.label}` : ch.label}</div>
        {pv && pv.files.length > 0 && <div style={{ fontFamily: mono, fontSize: 10.5, color: C.dim, maxHeight: 90, overflow: "auto" }}>{pv.files.slice(0, 12).map((f) => <div key={f}>{f}</div>)}{pv.files.length > 12 && <div>… {pv.files.length - 12} more</div>}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button data-testid="ship-commit" disabled={!ch.canCommit || busy} onClick={() => void act(false)} style={btn(ch.canCommit)}>commit</button>
          <button data-testid="ship-push" disabled={!ch.canPush || busy} onClick={() => void act(true)} title="commits, then pushes the branch to its remote" style={btn(ch.canPush)}>commit &amp; push</button>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ ...btn(false), border: "none" }}>cancel</button>
        </div>
      </div>
    </>
  );
}
