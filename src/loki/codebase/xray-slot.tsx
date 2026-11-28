// A PART OF X-RAY IS A SLOT (the operator 2026-11-18: "all the widgets that exist on the X-ray should be replaceable, not deletable; they still exist underneath"): the built-in component draws it until a declared widget is put in its place;
// "restore" puts the built-in back. Nothing here removes a part. The same replace/restore is what the agents' `antiloki_xray_slots` tool does, and what a theme's xray.yaml carries.
import * as React from "react";
import { C, mono, nav } from "@/loki/theme";
import { WidgetView, x2, type Drawn, type Widget } from "./xray-board";

type SlotRow = { slot: string; about: string; state: "built-in" | "replaced"; widget: string | null; from: string };
/** One read of the slots for every part of a page that asks within a moment (the X-ray screen asks once per section). */
const SLOTS_SEEN = new Map<string, { at: number; p: Promise<any> }>();
const slotsOf = (space: string, fresh = false): Promise<any> => { const hit = SLOTS_SEEN.get(space); if (!fresh && hit && Date.now() - hit.at < 2500) return hit.p; const p = x2<any>(space, "slots"); SLOTS_SEEN.set(space, { at: Date.now(), p }); return p; };
/** The slot a view is, and what draws it now. */
export function SlotFrame({ slot, space = "", children }: { slot: string; space?: string; children: React.ReactNode }) {
  const [row, setRow] = React.useState<SlotRow | null>(null); const [open, setOpen] = React.useState(false); const [widgets, setWidgets] = React.useState<Widget[]>([]); const [drawn, setDrawn] = React.useState<Drawn | null>(null); const [msg, setMsg] = React.useState<string | null>(null);
  const load = React.useCallback(async (fresh = false) => { const r = await slotsOf(space, fresh); if (r.ok && Array.isArray(r.slots)) setRow((r.slots as SlotRow[]).find((x) => x.slot === slot) ?? null); }, [space, slot]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { let stop = false; setDrawn(null); if (row?.state === "replaced" && row.widget) void x2<Drawn>(space, "data", { id: row.widget }).then((d) => { if (!stop) setDrawn(d); }); return () => { stop = true; }; }, [space, row?.state, row?.widget]);
  const pick = async () => { setOpen((o) => !o); if (!widgets.length) { const w = await x2<any>(space, "widgets"); if (w.ok) setWidgets(w.widgets); } };
  const replace = async (id: string) => { const r = await x2<any>(space, "slot_set", { slot, widget: id }); setMsg(r.ok ? null : r.error ?? "not replaced"); setOpen(false); await load(true); };
  const restore = async () => { const r = await x2<any>(space, "slot_reset", { slot }); setMsg(r.ok ? null : r.error ?? "not restored"); setOpen(false); await load(true); };
  const replaced = row?.state === "replaced";
  return (
    <div data-testid="xray-slot" data-slot={slot} data-state={row?.state ?? "built-in"} style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {replaced ? <div data-testid="slot-replacement" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12, fontFamily: nav, color: C.fg }}>{drawn ? <WidgetView res={drawn} /> : <span style={{ color: C.dim, fontSize: 12 }}>reading…</span>}</div> : children}
      <div style={{ position: "absolute", top: 8, right: 10, zIndex: 20, fontFamily: nav, fontSize: 12 }}>
        <button data-testid="slot-menu" onClick={() => void pick()} title={replaced ? `Replaced by ${row?.widget}: the built-in is still underneath` : "Replace this part with a widget (the built-in stays underneath)"} aria-label="replace this part" style={{ border: `1px solid ${replaced ? "color-mix(in srgb, #e08fd0 50%, transparent)" : C.border}`, background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 80%, transparent)", backdropFilter: "blur(10px)", color: replaced ? "#e08fd0" : C.muted, borderRadius: 999, padding: "2px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5 }}>{replaced ? `replaced · ${row?.widget}` : "⋯"}</button>
        {open && <div data-testid="slot-picker" style={{ marginTop: 6, width: 260, maxHeight: 280, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 14, background: "color-mix(in srgb, var(--c-panel2, var(--c-panel)) 88%, transparent)", backdropFilter: "blur(14px)", padding: 6, display: "grid", gap: 2 }}>
          {replaced && <button data-testid="slot-restore" onClick={() => void restore()} style={item}>↩ Restore the built-in</button>}
          <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, padding: "4px 8px", letterSpacing: ".06em" }}>PUT A WIDGET IN ITS PLACE</div>
          {widgets.map((w) => <button key={w.id} data-testid={`slot-pick-${w.id}`} onClick={() => void replace(w.id)} style={item}><b style={{ fontWeight: 500 }}>{w.title}</b> <span style={{ color: C.dim, fontFamily: mono, fontSize: 10.5 }}>{w.source} · {w.view}</span></button>)}
          {!widgets.length && <span style={{ color: C.dim, padding: "4px 8px" }}>reading the widgets…</span>}
        </div>}
        {msg && <div style={{ color: "var(--c-bad)", marginTop: 4 }}>{msg}</div>}
      </div>
    </div>
  );
}
const item: React.CSSProperties = { textAlign: "left", background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: "5px 8px", borderRadius: 8, fontFamily: "inherit", fontSize: 12.5 };
